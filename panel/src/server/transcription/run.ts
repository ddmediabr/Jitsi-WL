import "server-only";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { CASCADE, isModelId, MAX_ROUNDS, parseClock, RETRY_DELAY_MS, SINGLE_MODEL_ATTEMPTS, type Analysis, type Attempt, type Segment } from "@/lib/transcription";
import { dateFormatter } from "@/lib/tz";
import { db } from "@/server/db";
import { recordings, roomAccess, rooms, transcripts } from "@/server/db/schema";
import { emailRecordingLink } from "@/server/recordings/notify";
import { recordingPath } from "@/server/recordings/store";
import { BRAND_DEFAULT, getSetting } from "@/server/settings";
import { getTimeZone } from "@/server/timezone";
import { getProfileMap } from "@/server/users/profiles";
import { extractAudio, probeAudio } from "./audio";
import { runCascade } from "./cascade";
import { transcriptForAnalysis } from "./format";
import { deleteFile, errorKind, GeminiError, generateJson, uploadAudio } from "./gemini";
import { ANALYSIS_SCHEMA, analysisPrompt, TRANSCRIPTION_SCHEMA, transcriptionPrompt, type MeetingContext } from "./prompts";

const CHUNK_SECONDS = 3600;
const CHUNK_THRESHOLD = 7200; // acima de 2 h a reunião é dividida em blocos de 1 h (o limite que importa é o de SAÍDA do modelo)
const clean = (s: unknown, max = 4000) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");
const strings = (v: unknown, max = 200): string[] => (Array.isArray(v) ? v.map((x) => clean(x, max)).filter(Boolean) : []);
const arr = <T>(v: unknown, f: (x: Record<string, unknown>) => T): T[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").map((x) => f(x as Record<string, unknown>)) : []);

function parseSegments(text: string): Segment[] {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    throw new GeminiError("transient", "A transcrição veio em formato inválido (JSON cortado ou malformado).");
  }
  const list = (j as { segmentos?: unknown }).segmentos;
  if (!Array.isArray(list)) throw new GeminiError("transient", "A transcrição veio sem a lista de falas.");
  return list
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({ inicio: parseClock(clean(x.inicio, 20)), falante: clean(x.falante, 80) || "Participante", texto: clean(x.texto, 6000) }))
    .filter((s) => s.texto);
}

function parseAnalysis(text: string): Analysis {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new GeminiError("transient", "A análise veio em formato inválido (JSON cortado ou malformado).");
  }
  return {
    titulo: clean(j.titulo, 160),
    resumo_executivo: typeof j.resumo_executivo === "string" ? j.resumo_executivo.trim().slice(0, 8000) : "",
    participantes: arr(j.participantes, (x) => ({ nome: clean(x.nome, 80), papel: clean(x.papel, 300) })).filter((p) => p.nome),
    topicos: arr(j.topicos, (x) => ({ titulo: clean(x.titulo, 200), resumo: clean(x.resumo, 3000), falantes: strings(x.falantes, 80) })).filter((t) => t.titulo || t.resumo),
    decisoes: arr(j.decisoes, (x) => ({ decisao: clean(x.decisao, 1500), contexto: clean(x.contexto, 1500), responsaveis: strings(x.responsaveis, 80) })).filter((d) => d.decisao),
    pendencias: arr(j.pendencias, (x) => ({ descricao: clean(x.descricao, 1500), responsavel: clean(x.responsavel, 80), prazo: clean(x.prazo, 80) })).filter((p) => p.descricao),
    insights: arr(j.insights, (x) => ({ titulo: clean(x.titulo, 200), descricao: clean(x.descricao, 2000) })).filter((i) => i.titulo || i.descricao),
    tarefas_por_falante: arr(j.tarefas_por_falante, (x) => ({
      falante: clean(x.falante, 80),
      tarefas: arr(x.tarefas, (t) => ({ descricao: clean(t.descricao, 1500), prazo: clean(t.prazo, 80), combinado_com: clean(t.combinado_com, 120) })).filter((t) => t.descricao),
    })).filter((t) => t.falante && t.tarefas.length),
    pontos_de_atencao: strings(j.pontos_de_atencao, 800),
  };
}

const EMPTY_ANALYSIS: Analysis = {
  titulo: "",
  resumo_executivo: "Nenhuma fala foi identificada no áudio desta gravação.",
  participantes: [],
  topicos: [],
  decisoes: [],
  pendencias: [],
  insights: [],
  tarefas_por_falante: [],
  pontos_de_atencao: [],
};

async function buildContext(rec: typeof recordings.$inferSelect): Promise<MeetingContext> {
  const [brand, tz, glossary, access, names] = await Promise.all([
    getSetting("brand_name"),
    getTimeZone(),
    getSetting("transcription_glossary"),
    db().select({ username: roomAccess.username }).from(roomAccess).innerJoin(rooms, eq(rooms.id, roomAccess.roomId)).where(eq(rooms.name, rec.room)),
    getProfileMap(),
  ]);
  const nameOf = (u: string) => names.get(u) ?? u;
  return {
    brand: brand || BRAND_DEFAULT,
    room: rec.room,
    when: dateFormatter(tz, { dateStyle: "full", timeStyle: "short" }).format(rec.startedAt),
    initiator: rec.initiator ? nameOf(rec.initiator) : null,
    candidates: [...new Set(access.map((a) => nameOf(a.username)))],
    glossary,
  };
}

/**
 * Executa uma transcrição já marcada como "processing": áudio -> transcrição -> análise -> grava no banco.
 * É UMA execução só: se uma rodada inteira falha (todos os modelos / as 3 tentativas), agenda nova rodada daqui a 1 h (no máximo 3 rodadas).
 * Terminando (pronta ou erro definitivo), dispara o e-mail da gravação quando o pedido era "Transcrever ao final".
 */
export async function processRun(runId: string): Promise<void> {
  const t0 = Date.now();
  let log: Attempt[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let rodada = 1;
  let recordingId: string | null = null;
  let notify = false;
  const trModels = new Set<string>();
  let anModel: string | null = null;
  const tmp = await mkdtemp(join(tmpdir(), "transcricao-"));
  try {
    const [run] = await db().select().from(transcripts).where(eq(transcripts.id, runId)).limit(1);
    if (!run) return;
    recordingId = run.recordingId;
    notify = run.notifyEmail;
    rodada = run.round + 1;
    log = Array.isArray(run.attempts) ? (run.attempts as Attempt[]) : [];
    inputTokens = run.inputTokens ?? 0;
    outputTokens = run.outputTokens ?? 0;
    const [rec] = await db().select().from(recordings).where(eq(recordings.id, run.recordingId)).limit(1);
    if (!rec) throw new Error("A gravação não existe mais.");
    const file = recordingPath(rec.id);
    await stat(file).catch(() => {
      throw new Error("O arquivo da gravação não está mais no servidor.");
    });
    const probe = await probeAudio(file);
    if (!probe.hasAudio) throw new Error("A gravação não tem trilha de áudio.");
    const seconds = probe.seconds || rec.durationSeconds || 0;
    if (seconds < 5) throw new Error("A gravação é curta demais para transcrever.");

    const ctx = await buildContext(rec);
    const single = !!run.requestedModel && isModelId(run.requestedModel);
    const models = single ? [run.requestedModel as string] : [...CASCADE];
    const maxAttempts = single ? SINGLE_MODEL_ATTEMPTS : undefined;
    const chunks = seconds > CHUNK_THRESHOLD ? Math.ceil(seconds / CHUNK_SECONDS) : 1;
    const segments: Segment[] = [];

    for (let i = 0; i < chunks; i++) {
      const mp3 = join(tmp, `parte-${i + 1}.mp3`);
      await extractAudio(file, mp3, chunks > 1 ? { start: i * CHUNK_SECONDS, length: CHUNK_SECONDS } : undefined);
      // O envio do arquivo não depende de modelo: 3 tentativas para falhas passageiras.
      let up: { uri: string; name: string } | null = null;
      for (let a = 1; a <= 3 && !up; a++) {
        try {
          up = await uploadAudio(mp3, "audio/mpeg", `reuniao-${rec.id.slice(0, 8)}-parte-${i + 1}`);
        } catch (e) {
          if (errorKind(e) !== "transient" || a === 3) throw e;
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
      if (!up) throw new GeminiError("transient", "Não foi possível enviar o áudio ao Gemini.");
      try {
        const { value, model } = await runCascade({
          etapa: "transcricao",
          models,
          log,
          rodada,
          maxAttempts,
          fn: async (m) => {
            const g = await generateJson({ model: m, prompt: transcriptionPrompt(ctx, { index: i + 1, total: chunks }), schema: TRANSCRIPTION_SCHEMA, file: { uri: up.uri, mime: "audio/mpeg" } });
            const parsed = parseSegments(g.text);
            inputTokens += g.inputTokens;
            outputTokens += g.outputTokens;
            return parsed;
          },
        });
        trModels.add(model);
        segments.push(...value.map((s) => ({ ...s, inicio: s.inicio + i * CHUNK_SECONDS })));
      } finally {
        await deleteFile(up.name);
      }
    }

    let analysis = EMPTY_ANALYSIS;
    if (segments.length > 0) {
      const text = transcriptForAnalysis(segments);
      const { value, model } = await runCascade({
        etapa: "analise",
        models,
        log,
        rodada,
        maxAttempts,
        fn: async (m) => {
          const g = await generateJson({ model: m, prompt: analysisPrompt(ctx, text), schema: ANALYSIS_SCHEMA, maxOutputTokens: 32_768 });
          const parsed = parseAnalysis(g.text);
          inputTokens += g.inputTokens;
          outputTokens += g.outputTokens;
          return parsed;
        },
      });
      analysis = value;
      anModel = model;
    }

    await db()
      .update(transcripts)
      .set({
        status: "done",
        round: rodada,
        nextRunAt: null,
        modelTranscribe: [...trModels].join(" + ") || null,
        modelAnalyze: anModel,
        attempts: log,
        inputTokens,
        outputTokens,
        durationMs: Date.now() - t0,
        transcript: segments,
        analysis,
        error: null,
        finishedAt: new Date(),
      })
      .where(eq(transcripts.id, runId));
    if (notify && recordingId) void emailRecordingLink(recordingId, { transcriptRunId: runId });
  } catch (e) {
    const message = e instanceof Error ? e.message.replace(/\s+/g, " ").slice(0, 600) : "Erro desconhecido.";
    // Só falha de comunicação com o Gemini vale nova rodada; problemas da própria gravação (sem áudio, curta, arquivo sumiu) são definitivos.
    const retry = e instanceof GeminiError && rodada < MAX_ROUNDS;
    const common = { error: message, round: rodada, attempts: log, inputTokens, outputTokens, durationMs: Date.now() - t0, modelTranscribe: [...trModels].join(" + ") || null };
    if (retry) {
      await db()
        .update(transcripts)
        .set({ ...common, status: "waiting", nextRunAt: new Date(Date.now() + RETRY_DELAY_MS) })
        .where(eq(transcripts.id, runId));
      console.warn(`[transcricao] rodada ${rodada} falhou; nova tentativa em 1 h:`, message);
    } else {
      await db()
        .update(transcripts)
        .set({ ...common, status: "failed", nextRunAt: null, finishedAt: new Date() })
        .where(eq(transcripts.id, runId));
      console.warn("[transcricao] falhou em definitivo:", message);
      if (notify && recordingId) void emailRecordingLink(recordingId, { transcriptFailed: true });
    }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
