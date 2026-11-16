import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { rooms } from "@/server/db/schema";
import { ROOM_NAME } from "@/server/policy";
import { getLiveRooms } from "@/server/prosody/live";

/**
 * Estado público mínimo da sala para as telas de entrada: ela existe? é exclusiva? tem senha? expirou? Serve só para mostrar uma mensagem
 * clara ANTES de a pessoa tentar entrar. Quem decide o acesso é sempre o servidor de reuniões (Prosody), nunca esta resposta.
 */
export type RoomPublicInfo = { exists: boolean; exclusive: boolean; lobby: boolean; password: boolean; expired: boolean };

export async function roomPublicInfo(raw: string): Promise<RoomPublicInfo> {
  const room = raw.trim().toLowerCase();
  if (!ROOM_NAME.test(room)) return { exists: false, exclusive: false, lobby: true, password: false, expired: false };
  const row = (
    await db().select({ exclusive: rooms.exclusive, lobby: rooms.lobby, password: rooms.password, kind: rooms.kind, expiresAt: rooms.expiresAt }).from(rooms).where(eq(rooms.name, room)).limit(1)
  )[0];
  // Sala temporária vencida só aparece como "expirada" se não houver reunião em andamento (essa continua).
  let expired = false;
  if (row?.kind === "temporary" && row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    const live = await getLiveRooms();
    expired = live !== null && !live.some((r) => r.name === room && r.participants.length > 0);
  }
  return { exists: !!row, exclusive: row?.exclusive ?? false, lobby: row?.lobby ?? true, password: (row?.password ?? false) && !(row?.exclusive ?? false), expired };
}
