import { and, eq } from "drizzle-orm";
import { ROOM_NAME } from "@/server/policy";
import { db } from "@/server/db";
import { roomAccess, rooms } from "@/server/db/schema";
import { userOfRequest } from "@/server/prosody/identity";

// Este navegador é de um moderador REAL desta sala (e não de um interino)? Só a interface usa: esconde Configurações da sala e
// os controles de gravação de quem não é moderador real. Quem decide de verdade é o servidor de reuniões (ver mod_ddmedia_recording_guard).
//   GET ?room= -> { ok, moderator }
export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const room = (new URL(request.url).searchParams.get("room") ?? "").trim().toLowerCase();
  if (!ROOM_NAME.test(room)) return json(200, { ok: true, moderator: false });
  const user = await userOfRequest(request);
  if (!user) return json(200, { ok: true, moderator: false });
  try {
    const [row] = await db()
      .select({ role: roomAccess.role })
      .from(roomAccess)
      .innerJoin(rooms, eq(rooms.id, roomAccess.roomId))
      .where(and(eq(rooms.name, room), eq(roomAccess.username, user)))
      .limit(1);
    return json(200, { ok: true, moderator: row?.role === "moderator" });
  } catch {
    return json(503, { ok: false, moderator: false });
  }
}
