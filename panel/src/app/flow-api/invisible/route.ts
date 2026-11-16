import { ROOM_NAME } from "@/server/policy";
import { prosodyCall } from "@/server/prosody/client";
import { sameOrigin, tokenOf } from "@/server/prosody/identity";

// Modo invisível. Só moderador REAL da sala, com a opção ligada na conta (painel), pode pedir; quem decide é o Prosody, ligado
// ao segredo HttpOnly do navegador. O pedido vale para a próxima entrada nessa sala.
//   GET  ?room=      -> { available, on }
//   POST {room, on}  -> liga/desliga o pedido
export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function ask(room: string, token: string, on?: boolean) {
  try {
    const r = await prosodyCall("POST", "/session/invisible", on === undefined ? { token, room } : { token, room, on });
    if (r.status !== 200) return json(503, { ok: false, available: false, on: false });
    return json(200, { ok: true, available: r.json.available === true, on: r.json.on === true });
  } catch {
    return json(503, { ok: false, available: false, on: false });
  }
}

export async function GET(request: Request) {
  const room = (new URL(request.url).searchParams.get("room") ?? "").trim().toLowerCase();
  const token = tokenOf(request);
  if (!ROOM_NAME.test(room) || !token) return json(200, { ok: true, available: false, on: false });
  return ask(room, token);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { ok: false, error: "origem inválida" });
  let data: { room?: unknown; on?: unknown };
  try {
    data = JSON.parse((await request.text()).slice(0, 512));
  } catch {
    return json(400, { ok: false, error: "pedido inválido" });
  }
  const room = typeof data.room === "string" ? data.room.trim().toLowerCase() : "";
  const token = tokenOf(request);
  if (!ROOM_NAME.test(room) || !token || typeof data.on !== "boolean") return json(400, { ok: false, error: "pedido inválido" });
  return ask(room, token, data.on);
}
