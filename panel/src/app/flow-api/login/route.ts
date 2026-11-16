import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { roomAccess, rooms } from "@/server/db/schema";
import { MODERATOR_NAME, ROOM_NAME } from "@/server/policy";
import { prosodyCall } from "@/server/prosody/client";
import { sameOrigin } from "@/server/prosody/identity";

// Login do cadastrado feito PELO PAINEL, antes de abrir o Jitsi. O navegador envia usuário e senha por
// HTTPS; aqui conferimos no servidor de reuniões (que guarda só o hash) e ligamos o segredo do
// navegador (cookie HttpOnly __Host-ddpass) à conta. Depois disso o Prosody decide sozinho, no pedido
// de conferência: moderador recebe a sessão, usuário comum entra direto sem privilégios.
// A senha nunca é guardada nem registrada em log.

export const dynamic = "force-dynamic";

const MAX_BODY = 2048;
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, number[]>();

/** Limite de tentativas por IP+usuário (em memória: reinicia com o painel, e o Prosody é a barreira final). */
function tooMany(key: string): boolean {
  const now = Date.now();
  const list = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  attempts.set(key, list);
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.every((t) => now - t >= WINDOW_MS)) attempts.delete(k);
  return list.length > MAX_ATTEMPTS;
}

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  // Só a própria página (mesma origem): bloqueia chamadas vindas de outros sites.
  if (!sameOrigin(request)) return json(403, { ok: false, error: "origem inválida" });

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json(413, { ok: false, error: "pedido grande demais" });
  let data: { room?: unknown; user?: unknown; password?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: "pedido inválido" });
  }
  const room = typeof data.room === "string" ? data.room.trim().toLowerCase() : "";
  const user = typeof data.user === "string" ? data.user.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";
  const token = /(?:^|;\s*)__Host-ddpass=([0-9a-f]{32,128})/.exec(request.headers.get("cookie") ?? "")?.[1];
  if (!token || !ROOM_NAME.test(room) || !MODERATOR_NAME.test(user) || password.length < 1 || password.length > 128) {
    return json(400, { ok: false, error: "pedido inválido" });
  }

  // Último IP do X-Forwarded-For: o que o Traefik acrescenta (o primeiro vem do cliente e pode ser forjado).
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",").at(-1)?.trim() || "?";
  if (tooMany(`${ip}|${user}`)) return json(429, { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." });

  const roomRow = (await db().select().from(rooms).where(eq(rooms.name, room)).limit(1))[0];
  if (!roomRow) return json(404, { ok: false, error: "Sala não encontrada." });

  // Senha conferida e navegador ligado à conta (no servidor de reuniões).
  let status: number;
  try {
    status = (await prosodyCall("POST", "/session/grant", { token, username: user, password })).status;
  } catch {
    return json(503, { ok: false, error: "Servidor de reuniões indisponível. Tente de novo em instantes." });
  }
  if (status === 401) return json(401, { ok: false, error: "Usuário ou senha inválidos." });
  if (status !== 200) return json(503, { ok: false, error: "Servidor de reuniões indisponível. Tente de novo em instantes." });

  const access = (
    await db()
      .select({ role: roomAccess.role })
      .from(roomAccess)
      .where(and(eq(roomAccess.roomId, roomRow.id), eq(roomAccess.username, user)))
      .limit(1)
  )[0];
  const level = access?.role === "moderator" ? "moderator" : access?.role === "member" ? "member" : "none";
  return json(200, { ok: true, user, level, exclusive: roomRow.exclusive });
}
