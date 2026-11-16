import "server-only";
import { pgPool } from "@/server/db";

/** Meses de auditoria guardados. O piso (12) também é imposto pela função do banco. */
export const AUDIT_RETENTION_MONTHS = 12;

/** Apaga, pela função do banco, os registros de auditoria mais antigos que a retenção. Devolve quantos saíram. */
export async function purgeOldAudit(): Promise<number> {
  const r = await pgPool().query("select audit_purge($1) as n", [AUDIT_RETENTION_MONTHS]);
  return Number(r.rows[0]?.n ?? 0);
}
