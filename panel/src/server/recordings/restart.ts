import "server-only";
import { desc, gt } from "drizzle-orm";
import { db } from "@/server/db";
import { recordings, recordingStarts } from "@/server/db/schema";
import { env } from "@/server/env";

/** O reinício pelo painel só existe se o token e o serviço do Jibri estiverem configurados no ambiente. */
export function recorderRestartConfigured(): boolean {
  const e = env();
  return !!e.COOLIFY_API_TOKEN && !!e.COOLIFY_JIBRI_SERVICE_UUID;
}

/**
 * Heurística: há um "Gravar reunião" recente (até 8 h) sem nenhuma gravação entregue depois dele? Então pode haver gravação em andamento
 * (ou a última falhou). Reiniciar o gravador agora cortaria essa gravação.
 */
export async function recordingMayBeRunning(now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - 8 * 3600_000);
  const [start] = await db().select({ at: recordingStarts.at }).from(recordingStarts).where(gt(recordingStarts.at, since)).orderBy(desc(recordingStarts.at)).limit(1);
  if (!start) return false;
  const [delivered] = await db().select({ id: recordings.id }).from(recordings).where(gt(recordings.createdAt, start.at)).limit(1);
  return !delivered;
}

/**
 * Reinicia o serviço do Jibri (gravador + proxy) pela API do Coolify. Só este serviço, só reinício: o endereço é montado aqui
 * (nada vem do navegador) e o token nunca sai do servidor nem vai para log.
 */
export async function restartRecorder(): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = env();
  if (!e.COOLIFY_API_TOKEN || !e.COOLIFY_JIBRI_SERVICE_UUID) return { ok: false, error: "Reinício não configurado." };
  const url = `${e.COOLIFY_URL.replace(/\/$/, "")}/api/v1/services/${e.COOLIFY_JIBRI_SERVICE_UUID}/restart`;
  const tried: string[] = [];
  for (const method of ["POST", "GET"] as const) {
    try {
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${e.COOLIFY_API_TOKEN}`, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (res.ok) return { ok: true };
      const snippet = (await res.text().catch(() => "")).replace(/\s+/g, " ").replace(/<[^>]*>/g, "").slice(0, 90);
      tried.push(`${method} ${res.status}${snippet ? ` "${snippet}"` : ""}`);
      if (res.status === 404 || res.status === 405) continue; // versão da API que usa o outro método
      return { ok: false, error: `${res.status === 401 || res.status === 403 ? "O Coolify recusou o token (inválido, ou sem a permissão de deploy)." : "O Coolify recusou o pedido."} [${tried.join(", ")}]` };
    } catch {
      return { ok: false, error: "Não foi possível falar com o Coolify." };
    }
  }
  return { ok: false, error: `O Coolify não aceitou o pedido de reinício (${tried.join(", ")}).` };
}
