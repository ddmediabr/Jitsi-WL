import { audit } from "@/server/auth/audit";
import { ROOM_NAME } from "@/server/policy";
import { prosodyCall } from "@/server/prosody/client";
import { rateBlocked, rateRecord, sameOrigin, tokenOf } from "@/server/prosody/identity";

// "Sala com senha". Quem decide tudo é o servidor de reuniões (Prosody); aqui só repassamos, sempre ligados ao segredo
// HttpOnly do navegador (cookie __Host-ddpass), nunca a um dado que a página mande.
//   GET  ?room=  -> a senha vigente, SÓ para moderador da sala (real ou interino em exercício).
//   POST {room, password} -> convidado digitou a senha: se vale AGORA, o navegador ganha um prazo curto para entrar direto.
export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",").at(-1)?.trim() || "desconhecido";
}

export async function GET(request: Request) {
  const room = (new URL(request.url).searchParams.get("room") ?? "").trim().toLowerCase();
  const token = tokenOf(request);
  if (!ROOM_NAME.test(room) || !token) return json(200, { ok: true, moderator: false });
  try {
    const r = await prosodyCall("POST", "/room/password", { token, room });
    if (r.status !== 200) return json(503, { ok: false, moderator: false });
    if (r.json.moderator !== true) return json(200, { ok: true, moderator: false });
    return json(200, {
      ok: true,
      moderator: true,
      enabled: r.json.enabled === true,
      live: r.json.live === true,
      password: typeof r.json.password === "string" ? r.json.password : null,
      rotatesIn: typeof r.json.rotates_in === "number" ? r.json.rotates_in : null,
    });
  } catch {
    return json(503, { ok: false, moderator: false });
  }
}

const REASONS = new Set(["indisponivel", "fechada", "sem_reuniao", "senha"]);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { ok: false, error: "origem inválida" });
  let data: { room?: unknown; password?: unknown };
  try {
    data = JSON.parse((await request.text()).slice(0, 512));
  } catch {
    return json(400, { ok: false, error: "pedido inválido" });
  }
  const room = typeof data.room === "string" ? data.room.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";
  const token = tokenOf(request);
  if (!ROOM_NAME.test(room) || !token || password.length < 1 || password.length > 40) return json(400, { ok: false, error: "pedido inválido" });
  // Primeira barreira, antes de falar com o Prosody (que tem a sua, por navegador e por sala). Só as tentativas ERRADAS contam:
  // muita gente atrás do mesmo endereço (empresa) entrando com a senha certa não pode se bloquear.
  const ipKey = `roompw:${clientIp(request)}`;
  if (rateBlocked(ipKey, 20, 10 * 60_000)) return json(429, { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." });
  try {
    const r = await prosodyCall("POST", "/room/password/redeem", { token, room, password });
    if (r.status === 429) return json(429, { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." });
    if (r.status !== 200) return json(503, { ok: false, error: "Não foi possível falar com o servidor agora." });
    if (r.json.granted === true) {
      await audit({ action: "room.password.accepted", actorLabel: "convidado", targetType: "room", targetId: room, details: {} });
      return json(200, { ok: true, granted: true });
    }
    const reason = typeof r.json.reason === "string" && REASONS.has(r.json.reason) ? r.json.reason : "senha";
    if (reason === "senha") rateRecord(ipKey);
    return json(200, { ok: true, granted: false, reason });
  } catch {
    return json(503, { ok: false, error: "Não foi possível falar com o servidor agora." });
  }
}
