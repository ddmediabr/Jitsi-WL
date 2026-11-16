import "server-only";
import { unlink } from "node:fs/promises";
import { asc, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { recordings } from "@/server/db/schema";
import { getSetting } from "@/server/settings";
import { recordingPartPath, recordingPath } from "./store";

const GB = 1024 ** 3;

/** Margem para gravações já em andamento quando o limite é atingido: a limpeza age sempre 5 GB antes do teto definido. */
export const RESERVE_GB = 5;

/** Onde a limpeza começa (GB): teto definido menos a margem, nunca abaixo de 1 GB. */
export function cleanupLimitGb(capGb: number): number {
  return Math.max(capGb - RESERVE_GB, 1);
}

export async function remove(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) {
    await unlink(recordingPath(id)).catch(() => {}); // arquivo já ausente: só limpa a linha
    await unlink(recordingPartPath(id)).catch(() => {});
  }
  await db().delete(recordings).where(inArray(recordings.id, ids));
}

/** Uso atual: quantas gravações e quantos bytes. */
export async function recordingsUsage(): Promise<{ count: number; bytes: number }> {
  const [r] = await db().select({ count: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(${recordings.sizeBytes}), 0)::float8` }).from(recordings);
  return { count: r?.count ?? 0, bytes: r?.bytes ?? 0 };
}

/** Apaga o que passou do prazo de retenção. */
export async function purgeExpired(now = new Date()): Promise<number> {
  const days = await getSetting("recording_retention_days");
  const cutoff = new Date(now.getTime() - days * 24 * 3600_000);
  const old = await db().select({ id: recordings.id }).from(recordings).where(lt(recordings.endedAt, cutoff));
  await remove(old.map((r) => r.id));
  return old.length;
}

/**
 * Mantém o espaço dentro do limite de limpeza (teto − 5 GB): apaga as gravações MAIS ANTIGAS até caber `incoming` bytes. Nunca recusa nem para uma gravação:
 * se a nova, sozinha, passa do limite, ela fica (e as antigas saem). Devolve quantas apagou.
 */
export async function enforceStorageLimit(incoming = 0): Promise<number> {
  const cap = cleanupLimitGb(await getSetting("recording_max_gb")) * GB;
  const rows = await db().select({ id: recordings.id, size: recordings.sizeBytes }).from(recordings).orderBy(asc(recordings.startedAt));
  let total = rows.reduce((n, r) => n + r.size, 0) + incoming;
  const drop: string[] = [];
  for (const r of rows) {
    if (total <= cap) break;
    drop.push(r.id);
    total -= r.size;
  }
  await remove(drop);
  return drop.length;
}

/** Limpeza completa (prazo e espaço): roda a cada hora e depois de cada entrega. */
export async function purgeAll(): Promise<{ expired: number; overLimit: number }> {
  const expired = await purgeExpired();
  const overLimit = await enforceStorageLimit(0);
  if (expired + overLimit > 0) console.info(`[recordings] limpeza: ${expired} por prazo, ${overLimit} por limite de espaço`);
  return { expired, overLimit };
}
