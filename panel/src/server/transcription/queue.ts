import "server-only";
import { and, asc, eq, lt, lte, sql } from "drizzle-orm";
import { isModelId } from "@/lib/transcription";
import { db } from "@/server/db";
import { recordings, transcripts } from "@/server/db/schema";
import { env } from "@/server/env";
import { emailRecordingLink } from "@/server/recordings/notify";
import { processRun } from "./run";

/** A transcrição só funciona com a chave do Gemini configurada. */
export const transcriptionConfigured = () => !!env().GEMINI_API_KEY;

const state = globalThis as unknown as { __ddTranscribing?: boolean };

/** Cria um pedido na fila (e acorda o trabalhador). `model` = null usa o modo Automático (failover entre os modelos). */
export async function enqueueTranscription(recordingId: string, model: string | null = null, notifyEmail = false): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!transcriptionConfigured()) return { ok: false, error: "A chave do Gemini não está configurada no servidor." };
  if (model !== null && !isModelId(model)) return { ok: false, error: "Modelo desconhecido." };
  const [rec] = await db().select({ id: recordings.id }).from(recordings).where(eq(recordings.id, recordingId)).limit(1);
  if (!rec) return { ok: false, error: "Gravação não encontrada." };
  const [active] = await db()
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(and(eq(transcripts.recordingId, recordingId), sql`${transcripts.status} in ('queued','processing','waiting')`))
    .limit(1);
  if (active) return { ok: false, error: "Já existe uma transcrição desta gravação em andamento." };
  const [row] = await db().insert(transcripts).values({ recordingId, requestedModel: model, notifyEmail }).returning({ id: transcripts.id });
  kickWorker();
  return { ok: true, id: row.id };
}

/**
 * Gravação entregue com "Transcrever ao final" ligado: transcreve no modo Automático e só então envia o e-mail (gravação + transcrição).
 * Se não der nem para enfileirar (sem chave do Gemini, erro), envia o e-mail só com a gravação. Nunca lança erro.
 */
export async function transcribeThenEmail(recordingId: string): Promise<void> {
  try {
    if (transcriptionConfigured()) {
      const r = await enqueueTranscription(recordingId, null, true);
      if (r.ok) return;
      console.warn("[transcricao] não foi possível enfileirar:", r.error);
    }
  } catch (e) {
    console.warn("[transcricao] não foi possível enfileirar:", e instanceof Error ? e.message : e);
  }
  await emailRecordingLink(recordingId);
}

/** Rodadas agendadas (status "waiting") cuja hora chegou voltam para a fila. */
export async function requeueDue(): Promise<void> {
  await db().update(transcripts).set({ status: "queued" }).where(and(eq(transcripts.status, "waiting"), lte(transcripts.nextRunAt, new Date())));
}

/** Uma tarefa por vez (cota e CPU). Roda até a fila esvaziar. */
export function kickWorker(): void {
  if (state.__ddTranscribing) return;
  state.__ddTranscribing = true;
  void (async () => {
    try {
      for (;;) {
        await requeueDue();
        const [next] = await db().select({ id: transcripts.id }).from(transcripts).where(eq(transcripts.status, "queued")).orderBy(asc(transcripts.createdAt)).limit(1);
        if (!next) break;
        const claimed = await db().update(transcripts).set({ status: "processing", startedAt: new Date() }).where(and(eq(transcripts.id, next.id), eq(transcripts.status, "queued"))).returning({ id: transcripts.id });
        if (claimed.length === 0) continue;
        await processRun(next.id);
      }
    } catch (e) {
      console.error("[transcricao] trabalhador parou:", e instanceof Error ? e.message : e);
    } finally {
      state.__ddTranscribing = false;
    }
  })();
}

/** Na inicialização: o que estava "processando" quando o painel reiniciou volta para a fila. */
export async function recoverStuck(): Promise<void> {
  await db().update(transcripts).set({ status: "queued", startedAt: null }).where(eq(transcripts.status, "processing"));
  // Pedidos muito antigos que travaram sem o painel reiniciar.
  await db().update(transcripts).set({ status: "failed", error: "Tempo esgotado.", finishedAt: new Date() }).where(and(eq(transcripts.status, "queued"), lt(transcripts.createdAt, new Date(Date.now() - 24 * 3600_000))));
}
