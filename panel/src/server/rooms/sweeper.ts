import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { audit } from "@/server/auth/audit";
import { db } from "@/server/db";
import { rooms } from "@/server/db/schema";
import { getLiveRooms } from "@/server/prosody/live";
import { pushPolicyNotice } from "@/server/prosody/sync";

/**
 * Varredura das salas temporárias (roda a cada minuto, dentro do painel).
 *
 * A sala some quando passa do prazo de existência. Reunião em andamento NUNCA é cortada: se ainda há gente na
 * sala vencida, ela fica até a reunião acabar e é apagada na varredura seguinte. Antes de apagar, confere de
 * novo se alguém entrou (corrida entre expirar e entrar). Se o servidor de reuniões não responder, não apaga
 * nada: na dúvida, a sala fica.
 * O Prosody também recusa abrir reunião nova numa sala vencida (política com `expires_at`), sem esperar esta rotina.
 *
 * (A reunião em si não precisa de limpeza: o Jitsi encerra a sessão sozinho quando o último participante sai, e
 * quem volta ao mesmo endereço começa uma sessão nova.)
 */
export async function sweepTemporaryRooms(now = new Date()): Promise<{ checked: number; deleted: string[] }> {
  const list = await db().select().from(rooms).where(eq(rooms.kind, "temporary"));
  const expired = list.filter((r) => r.expiresAt !== null && now.getTime() >= r.expiresAt.getTime());
  if (expired.length === 0) return { checked: list.length, deleted: [] };

  const occupiedNow = async () => {
    const live = await getLiveRooms();
    return live === null ? null : new Set(live.filter((r) => r.participants.length > 0).map((r) => r.name));
  };
  const first = await occupiedNow();
  if (first === null) return { checked: list.length, deleted: [] }; // sem estado ao vivo: não decide nada
  const due = expired.filter((r) => !first.has(r.name));
  if (due.length === 0) return { checked: list.length, deleted: [] };

  // Segunda conferência, logo antes de apagar.
  const second = await occupiedNow();
  if (second === null) return { checked: list.length, deleted: [] };
  const toDelete = due.filter((r) => !second.has(r.name));
  if (toDelete.length === 0) return { checked: list.length, deleted: [] };

  // Só apaga se ainda for temporária (alguém pode ter tornado a sala permanente nesse meio tempo).
  const deleted = await db()
    .delete(rooms)
    .where(and(inArray(rooms.id, toDelete.map((d) => d.id)), eq(rooms.kind, "temporary")))
    .returning({ name: rooms.name });
  for (const r of deleted) {
    await audit({
      action: "room.expire",
      actorLabel: "sistema",
      system: true,
      targetType: "room",
      targetId: r.name,
      details: { motivo: "prazo de existência encerrado" },
    });
  }
  if (deleted.length > 0) await pushPolicyNotice();
  return { checked: list.length, deleted: deleted.map((d) => d.name) };
}
