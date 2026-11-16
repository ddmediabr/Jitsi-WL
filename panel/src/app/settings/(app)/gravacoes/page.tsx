import { desc } from "drizzle-orm";
import RecordingsTable from "@/components/settings/RecordingsTable";
import type { RunInfo } from "@/components/settings/TranscriptionCell";
import { transcriptionConfigured } from "@/server/transcription/queue";
import { transcripts } from "@/server/db/schema";
import { type Attempt } from "@/lib/transcription";
import { dateFormatter } from "@/lib/tz";
import { hasRole, requireFullAuth } from "@/server/auth/dal";
import { db } from "@/server/db";
import { recordings } from "@/server/db/schema";
import { getSetting } from "@/server/settings";
import { getTimeZone } from "@/server/timezone";

function duration(sec: number | null): string {
  if (sec === null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : m > 0 ? `${m}min ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function size(bytes: number): string {
  const mb = bytes / 1024 ** 2;
  return mb >= 1024 ? `${(mb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB` : `${mb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

export default async function RecordingsPage() {
  const admin = await requireFullAuth();
  // Todos os administradores veem e baixam; só o proprietário apaga.
  const canDelete = hasRole(admin, "owner");
  const tz = await getTimeZone();
  const fmt = dateFormatter(tz, { dateStyle: "short", timeStyle: "short" });
  const days = await getSetting("recording_retention_days");
  const list = await db().select().from(recordings).orderBy(desc(recordings.startedAt));
  const hm = dateFormatter(tz, { timeStyle: "short" });
  const allRuns = await db().select().from(transcripts).orderBy(desc(transcripts.createdAt));
  const runsOf = (recId: string): RunInfo[] =>
    allRuns
      .filter((t) => t.recordingId === recId)
      .map((t) => ({
        id: t.id,
        status: t.status as RunInfo["status"],
        requested: t.requestedModel,
        modelTr: t.modelTranscribe,
        modelAn: t.modelAnalyze,
        created: fmt.format(t.createdAt),
        took: t.durationMs ? `${Math.round(t.durationMs / 1000)} s` : "—",
        tokens: t.inputTokens != null ? `${(t.inputTokens / 1000).toFixed(1)} mil tokens de entrada, ${((t.outputTokens ?? 0) / 1000).toFixed(1)} mil de saída` : "—",
        error: t.error,
        nextRetry: t.nextRunAt ? hm.format(t.nextRunAt) : null,
        attempts: (Array.isArray(t.attempts) ? t.attempts : []) as Attempt[],
      }));

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-[34px] leading-tight font-bold">Gravações</h1>
        <p className="max-w-none! text-[15px] leading-relaxed text-muted-foreground">
          Gravações das reuniões, da mais recente para a mais antiga. Ficam guardadas por {days} dias e, se o espaço acabar, as mais antigas saem primeiro.
        </p>
      </div>
      <RecordingsTable
        timeZone={tz}
        canDelete={canDelete}
        transcriptionConfigured={transcriptionConfigured()}
        rows={list.map((r) => ({ id: r.id, startedAt: r.startedAt.toISOString(), room: r.room, started: fmt.format(r.startedAt), duration: duration(r.durationSeconds), size: size(r.sizeBytes), initiator: r.initiator, runs: runsOf(r.id) }))}
      />
    </div>
  );
}
