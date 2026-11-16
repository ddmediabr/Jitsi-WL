import "server-only";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import type { Analysis, Segment } from "@/lib/transcription";
import { dateFormatter } from "@/lib/tz";
import { db } from "@/server/db";
import { recordings, transcripts } from "@/server/db/schema";
import { getBrandAsset } from "@/server/brand/brand";
import { BRAND_DEFAULT, getSetting } from "@/server/settings";
import { getTimeZone } from "@/server/timezone";
import { getProfileMap } from "@/server/users/profiles";
import { buildAnalysisDocx } from "./docx";
import { renderTranscriptTxt, type DocMeta } from "./format";

export type LoadedRun = {
  run: typeof transcripts.$inferSelect;
  rec: typeof recordings.$inferSelect;
  meta: DocMeta;
  segments: Segment[];
  analysis: Analysis;
  /** Base do nome dos arquivos: sala_aaaammdd-hhmm */
  base: string;
};

function durationText(sec: number | null): string {
  if (sec === null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : m > 0 ? `${m} min ${String(sec % 60).padStart(2, "0")} s` : `${sec} s`;
}

/** Carrega uma execução concluída (a pedida, ou a mais recente concluída da gravação) com os dados do cabeçalho dos documentos. */
export async function loadRun(recordingId: string, runId: string | null): Promise<LoadedRun | null> {
  const [rec] = await db().select().from(recordings).where(eq(recordings.id, recordingId)).limit(1);
  if (!rec) return null;
  const runs = await db().select().from(transcripts).where(eq(transcripts.recordingId, recordingId));
  const done = runs.filter((r) => r.status === "done").sort((a, b) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0));
  const run = runId ? done.find((r) => r.id === runId) : done[0];
  if (!run || !Array.isArray(run.transcript) || !run.analysis) return null;

  const [tz, brand, names] = await Promise.all([getTimeZone(), getSetting("brand_name"), getProfileMap()]);
  const when = dateFormatter(tz, { dateStyle: "full", timeStyle: "short" }).format(rec.startedAt);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(rec.startedAt).map((x) => [x.type, x.value]));
  const meta: DocMeta = {
    brand: brand || BRAND_DEFAULT,
    room: rec.room,
    when,
    duration: durationText(rec.durationSeconds),
    initiator: rec.initiator ? (names.get(rec.initiator) ?? rec.initiator) : null,
    model: run.modelAnalyze ?? run.modelTranscribe,
  };
  return {
    run,
    rec,
    meta,
    segments: run.transcript as Segment[],
    analysis: run.analysis as Analysis,
    base: `${rec.room.replace(/[^a-z0-9_-]/gi, "_")}_${p.year}${p.month}${p.day}-${p.hour}${p.minute}`,
  };
}

export const txtOf = (l: LoadedRun): string => renderTranscriptTxt(l.meta, l.segments);

/** Logo para a capa: o do tema claro (a capa é branca); sem ele, a capa usa só o nome da marca. */
async function coverLogo(): Promise<{ data: Buffer; width: number; height: number } | null> {
  const asset = await getBrandAsset("logo_light").catch(() => null);
  if (!asset) return null;
  try {
    const { data, info } = await sharp(asset.data).resize({ width: 320, height: 90, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}

export async function docxOf(l: LoadedRun): Promise<Buffer> {
  const accent = (await getSetting("accent_color_light")) || (await getSetting("accent_color")) || "#0A74E6";
  return buildAnalysisDocx({ meta: l.meta, analysis: l.analysis, logo: await coverLogo(), accent: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#0A74E6" });
}
