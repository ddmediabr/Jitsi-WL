import { and, desc, eq, gt } from "drizzle-orm";
import { ROOM_NAME } from "@/server/policy";
import { db } from "@/server/db";
import { recordingStarts, roomAccess, rooms } from "@/server/db/schema";
import { rateLimited, sameOrigin, userOfRequest } from "@/server/prosody/identity";

// "Transcrever ao final" pode ser ligado/desligado a qualquer momento da gravação: a página avisa o painel a cada mudança.
// Quando a gravação é entregue, vale o que estiver marcado neste momento.
//   POST ?room=&on=1|0  ->  { ok }
export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { ok: false });
  const url = new URL(request.url);
  const room = (url.searchParams.get("room") ?? "").trim().toLowerCase();
  if (!ROOM_NAME.test(room)) return json(400, { ok: false });
  const user = await userOfRequest(request);
  if (!user) return json(401, { ok: false });
  if (rateLimited(`rec-transcribe:${user}`, 30, 60_000)) return json(429, { ok: false });
  try {
    const [row] = await db()
      .select({ role: roomAccess.role })
      .from(roomAccess)
      .innerJoin(rooms, eq(rooms.id, roomAccess.roomId))
      .where(and(eq(rooms.name, room), eq(roomAccess.username, user)))
      .limit(1);
    if (row?.role !== "moderator") return json(403, { ok: false });
    const [latest] = await db()
      .select({ id: recordingStarts.id })
      .from(recordingStarts)
      .where(and(eq(recordingStarts.room, room), gt(recordingStarts.at, new Date(Date.now() - 24 * 3600_000))))
      .orderBy(desc(recordingStarts.at))
      .limit(1);
    if (latest) await db().update(recordingStarts).set({ transcribe: url.searchParams.get("on") === "1" }).where(eq(recordingStarts.id, latest.id));
    return json(200, { ok: true });
  } catch {
    return json(503, { ok: false });
  }
}
