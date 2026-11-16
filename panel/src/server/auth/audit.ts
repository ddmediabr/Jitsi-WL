import "server-only";
import { db } from "@/server/db";
import { auditLog } from "@/server/db/schema";
import { clientInfo } from "./request";

export type AuditInput = {
  action: string; // ex.: "auth.login.success"
  actorId?: string | null;
  actorLabel?: string | null;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  /** Ação do próprio sistema (rotina em segundo plano): não há requisição, então sem IP nem navegador. */
  system?: boolean;
};

/**
 * Registra na trilha de auditoria. NUNCA grave senhas, códigos TOTP, tokens ou segredos em `details`.
 * Uma falha ao auditar não derruba a operação, mas vai para o log do servidor.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const { ip, userAgent } = input.system ? { ip: null, userAgent: null } : await clientInfo();
    await db()
      .insert(auditLog)
      .values({
        action: input.action,
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        ip,
        userAgent,
        details: input.details ?? null,
      });
  } catch (error) {
    console.error("[auditoria] falha ao registrar", input.action, error instanceof Error ? error.message : error);
  }
}
