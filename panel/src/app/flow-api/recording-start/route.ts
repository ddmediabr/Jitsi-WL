import { and, eq, lt } from "drizzle-orm";
import { ROOM_NAME } from "@/server/policy";
import { db } from "@/server/db";
import { recordingStarts, roomAccess, rooms } from "@/server/db/schema";
import { rateLimited, sameOrigin, userOfRequest } from "@/server/prosody/identity";

// A página avisa o painel quando um moderador real clica em "Gravar reunião". O Jibri não diz quem iniciou,
// então a entrega da gravação (ingest) casa este registro pela sala e pelo horário.
//   POST ?room=  ->  { ok }
export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { ok: false });
  const room = (new URL(request.url).searchParams.get("room") ?? "").trim().toLowerCase();
  if (!ROOM_NAME.test(room)) return json(400, { ok: false });
  const user = await userOfRequest(request);
  if (!user) return json(401, { ok: false });
  if (rateLimited(`rec-start:${user}`, 10, 60_000)) return json(429, { ok: false });
  try {
    // Só moderador real da sala vale (o servidor de reuniões já barra os demais; aqui evita registro falso).
    const [row] = await db()
      .select({ role: roomAccess.role })
      .from(roomAccess)
      .innerJoin(rooms, eq(rooms.id, roomAccess.roomId))
      .where(and(eq(rooms.name, room), eq(roomAccess.username, user)))
      .limit(1);
    if (row?.role !== "moderator") return json(403, { ok: false });
    await db().insert(recordingStarts).values({ room, username: user, transcribe: new URL(request.url).searchParams.get("transcribe") === "1" });
    await db().delete(recordingStarts).where(lt(recordingStarts.at, new Date(Date.now() - 3 * 24 * 3600_000)));
    return json(200, { ok: true });
  } catch {
    return json(503, { ok: false });
  }
}
