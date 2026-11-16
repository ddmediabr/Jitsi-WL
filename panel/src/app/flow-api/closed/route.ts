import { ROOM_NAME } from "@/server/policy";
import { prosodyCall } from "@/server/prosody/client";
import { sameOrigin } from "@/server/prosody/identity";

// "Reunião fechada": um moderador da sala liga/desliga, dentro da sala. Quem decide se o pedido vale é o
// servidor de reuniões: só um moderador cadastrado nesta sala, ligado ao segredo do navegador (cookie
// HttpOnly __Host-ddpass, que só o servidor lê), consegue alterar. Aqui só repassamos o pedido.

export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function tokenOf(request: Request): string | null {
  return /(?:^|;\s*)__Host-ddpass=([0-9a-f]{32,128})/.exec(request.headers.get("cookie") ?? "")?.[1] ?? null;
}

async function forward(room: string, token: string, closed?: boolean) {
  try {
    const r = await prosodyCall("POST", "/room/closed", closed === undefined ? { token, room } : { token, room, closed });
    return json(r.status === 200 || r.status === 409 ? r.status : 503, {
      ok: r.json.ok === true,
      moderator: r.json.moderator === true,
      live: r.json.live === true,
      closed: r.json.closed === true,
    });
  } catch {
    return json(503, { ok: false, moderator: false, live: false, closed: false });
  }
}

/** Estado atual (também diz se este navegador é de um moderador da sala). */
export async function GET(request: Request) {
  const room = (new URL(request.url).searchParams.get("room") ?? "").trim().toLowerCase();
  const token = tokenOf(request);
  if (!ROOM_NAME.test(room) || !token) return json(200, { ok: true, moderator: false, live: false, closed: false });
  return forward(room, token);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { ok: false, error: "origem inválida" });

  let data: { room?: unknown; closed?: unknown };
  try {
    data = JSON.parse((await request.text()).slice(0, 1024));
  } catch {
    return json(400, { ok: false, error: "pedido inválido" });
  }
  const room = typeof data.room === "string" ? data.room.trim().toLowerCase() : "";
  const token = tokenOf(request);
  if (!ROOM_NAME.test(room) || !token || typeof data.closed !== "boolean") return json(400, { ok: false, error: "pedido inválido" });
  return forward(room, token, data.closed);
}
