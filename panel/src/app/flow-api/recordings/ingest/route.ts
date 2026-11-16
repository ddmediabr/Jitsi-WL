import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { open, rename, statfs, unlink } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { env } from "@/server/env";
import { db } from "@/server/db";
import { recordingStarts, recordings } from "@/server/db/schema";
import { ROOM_NAME } from "@/server/policy";
import { emailRecordingLink } from "@/server/recordings/notify";
import { transcribeThenEmail } from "@/server/transcription/queue";
import { enforceStorageLimit, purgeAll } from "@/server/recordings/purge";
import { recordingPartPath, recordingPath, recordingsDir } from "@/server/recordings/store";

// Entrega da gravação pelo Jibri (script de finalização). Só o gravador, com o segredo compartilhado, entrega:
//   POST  Authorization: Bearer <segredo>  ·  corpo = arquivo .mp4  ·  cabeçalhos X-Rec-Room, X-Rec-Session, X-Rec-Name, X-Rec-Duration, X-Rec-Started
// O arquivo é gravado em fluxo (sem carregar na memória) como `<id>.part` e só vira `<id>.mp4` depois de conferido.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 ** 3; // 8 GB por gravação
const MIN_BYTES = 1024;
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let active = 0; // entregas em andamento (limite simples, em memória)

const json = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const digest = (v: string) => createHash("sha256").update(v).digest();
function authorized(request: Request, secret: string): boolean {
  const given = /^Bearer (.{32,256})$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  return timingSafeEqual(digest(given), digest(secret));
}

export async function POST(request: Request) {
  const secret = env().RECORDING_INGEST_SECRET;
  if (!secret) return json(503, { ok: false, error: "entrega desligada" });
  if (!authorized(request, secret)) return json(401, { ok: false, error: "não autorizado" });

  const h = request.headers;
  const room = (h.get("x-rec-room") ?? "").trim().toLowerCase();
  const session = (h.get("x-rec-session") ?? "").trim().toLowerCase();
  const name = (h.get("x-rec-name") ?? "").replace(/[^\w.\- ]/g, "_").slice(0, 160) || "gravacao.mp4";
  const duration = Number.parseInt(h.get("x-rec-duration") ?? "", 10);
  const length = Number.parseInt(h.get("content-length") ?? "", 10);
  if (!ROOM_NAME.test(room) || !SESSION.test(session)) return json(400, { ok: false, error: "cabeçalhos inválidos" });
  if (!Number.isFinite(length) || length < MIN_BYTES || length > MAX_BYTES) return json(413, { ok: false, error: "tamanho inválido" });
  if (!request.body) return json(400, { ok: false, error: "sem corpo" });

  // Já entregue (reenvio): sucesso sem regravar.
  const [exists] = await db().select({ id: recordings.id }).from(recordings).where(eq(recordings.sessionId, session)).limit(1);
  if (exists) return json(200, { ok: true, id: exists.id, duplicate: true });

  if (active >= 2) return json(429, { ok: false, error: "muitas entregas ao mesmo tempo" });
  // Limite de espaço: nunca para a gravação; apaga as mais antigas para caber esta.
  await enforceStorageLimit(length).catch((e) => console.warn("[recordings] limpeza antes da entrega falhou:", (e as Error).message));
  try {
    const fs = await statfs(recordingsDir());
    if (fs.bavail * fs.bsize < length * 1.5 + 512 * 1024 ** 2) return json(507, { ok: false, error: "sem espaço" });
  } catch {
    return json(503, { ok: false, error: "pasta de gravações indisponível" });
  }

  const id = randomUUID();
  const part = recordingPartPath(id);
  active++;
  try {
    let received = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        received += chunk.length;
        if (received > length) return cb(new Error("corpo maior que o declarado"));
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(request.body as unknown as NodeWebStream), counter, createWriteStream(part, { flags: "wx", mode: 0o640 }));
    if (received !== length) throw new Error("corpo menor que o declarado");

    // Confere que parece um MP4 (caixa "ftyp" nos bytes 4 a 8).
    const fh = await open(part, "r");
    try {
      const head = Buffer.alloc(12);
      await fh.read(head, 0, 12, 0);
      if (head.subarray(4, 8).toString("latin1") !== "ftyp") throw new Error("não é MP4");
    } finally {
      await fh.close();
    }
    await rename(part, recordingPath(id));

    const endedAt = new Date();
    const startedAtHeader = new Date(h.get("x-rec-started") ?? "");
    const startedAt = !Number.isNaN(startedAtHeader.getTime()) && startedAtHeader <= endedAt ? startedAtHeader : new Date(endedAt.getTime() - (Number.isFinite(duration) ? duration * 1000 : 0));
    // Quem iniciou: o último "Gravar reunião" desta sala pouco antes do início do arquivo (a página avisa em /flow-api/recording-start).
    const [starter] = await db()
      .select({ username: recordingStarts.username, transcribe: recordingStarts.transcribe })
      .from(recordingStarts)
      .where(and(eq(recordingStarts.room, room), gte(recordingStarts.at, new Date(startedAt.getTime() - 3 * 60_000)), lte(recordingStarts.at, endedAt)))
      .orderBy(desc(recordingStarts.at))
      .limit(1);
    const initiator = starter?.username ?? null;
    await db().insert(recordings).values({
      id,
      room,
      sessionId: session,
      fileName: name,
      sizeBytes: length,
      durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : null,
      startedAt,
      endedAt,
      initiator,
      resolution: /^\d{3,4}x\d{3,4}$/.exec((h.get("x-rec-resolution") ?? "").trim())?.[0] ?? null,
    });
    console.info(`[recordings] entregue ${id} sala=${room} ${Math.round(length / 1024)} KB`);
    void purgeAll().catch(() => {});
    // "Transcrever ao final" ligado ao terminar: o e-mail sai só depois da transcrição. Desligado: e-mail direto, só com a gravação.
    if (starter?.transcribe === true) void transcribeThenEmail(id);
    else void emailRecordingLink(id);
    return json(200, { ok: true, id });
  } catch (err) {
    await unlink(part).catch(() => {});
    await unlink(recordingPath(id)).catch(() => {});
    console.warn(`[recordings] entrega recusada: ${(err as Error).message}`);
    return json(400, { ok: false, error: "entrega inválida" });
  } finally {
    active--;
  }
}
