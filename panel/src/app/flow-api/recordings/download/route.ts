import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { audit } from "@/server/auth/audit";
import { db } from "@/server/db";
import { recordings } from "@/server/db/schema";
import { rateLimited } from "@/server/prosody/identity";
import { verifyDownloadToken } from "@/server/recordings/link";
import { recordingPath } from "@/server/recordings/store";
import { getTimeZone } from "@/server/timezone";

// Download pelo link enviado por e-mail: o token assinado (id + validade) é a credencial; sem login.
//   GET ?t=<token>  ->  mp4 (anexo)  ·  link vencido ou inválido: página de texto simples
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "?";
  if (rateLimited(`rec-dl:${ip}`, 20, 60_000)) return text(429, "Muitas tentativas. Aguarde um minuto.");
  const id = verifyDownloadToken(new URL(request.url).searchParams.get("t") ?? "");
  if (!id) return text(410, "Este link venceu ou é inválido. Peça a gravação a um administrador do painel.");

  const [row] = await db().select().from(recordings).where(eq(recordings.id, id)).limit(1);
  const info = row ? await stat(recordingPath(row.id)).catch(() => null) : null;
  if (!row || !info) return text(404, "Esta gravação não está mais disponível.");

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: await getTimeZone(), hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(row.startedAt)
      .map((x) => [x.type, x.value]),
  );
  const name = `${row.room.replace(/[^a-z0-9_-]/gi, "_")}_${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}.mp4`;
  await audit({ action: "recording.download.link", system: true, targetType: "recording", targetId: id, details: { sala: row.room } });

  return new Response(Readable.toWeb(createReadStream(recordingPath(row.id))) as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(info.size),
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
