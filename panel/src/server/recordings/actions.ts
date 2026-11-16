"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { db } from "@/server/db";
import { recordings } from "@/server/db/schema";
import { remove } from "./purge";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Apaga uma gravação (arquivo e registro). Só o proprietário: os demais administradores veem e baixam. */
export async function deleteRecordingAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("owner");
  const id = String(formData.get("id") ?? "");
  if (!ID.test(id)) return;
  const [row] = await db().select({ room: recordings.room, startedAt: recordings.startedAt }).from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!row) return;
  await remove([id]);
  await audit({ action: "recording.delete", actorId: admin.id, actorLabel: admin.username, targetType: "recording", targetId: id, details: { sala: row.room, inicio: row.startedAt.toISOString() } });
  revalidatePath("/settings/gravacoes");
}
