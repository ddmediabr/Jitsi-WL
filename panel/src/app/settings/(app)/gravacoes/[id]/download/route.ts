import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { db } from "@/server/db";
import { recordings } from "@/server/db/schema";
import { recordingPath } from "@/server/recordings/store";
import { getTimeZone } from "@/server/timezone";

export const dynamic = "force-dynamic";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Download autenticado (administrador do painel). O caminho do arquivo nunca vem do pedido: só o id, conferido no banco. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireFullAuth("admin");
  const { id } = await ctx.params;
  if (!ID.test(id)) return new Response("Não encontrado", { status: 404 });
  const [row] = await db().select().from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!row) return new Response("Não encontrado", { status: 404 });

  const file = recordingPath(row.id);
  const info = await stat(file).catch(() => null);
  if (!info) return new Response("Arquivo não encontrado", { status: 404 });

  // Data do nome no fuso das configurações (não em UTC).
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: await getTimeZone(), hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(row.startedAt)
      .map((x) => [x.type, x.value]),
  );
  const stamp = `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
  const name = `${row.room.replace(/[^a-z0-9_-]/gi, "_")}_${stamp}.mp4`;
  await audit({ action: "recording.download", actorId: admin.id, actorLabel: admin.username, targetType: "recording", targetId: id, details: { sala: row.room } });

  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(info.size),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
