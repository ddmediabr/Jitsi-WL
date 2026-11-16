"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cleanLine, DEFAULT_HALL_TITLE, HALL_SUBTITLE_MAX, HALL_TITLE_MAX, isRoomIcon, ROOM_DESCRIPTION_MAX } from "@/lib/hall";
import { EXIT_TEXT_MAX, EXIT_TITLE_MAX } from "@/lib/exit-texts";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { db } from "@/server/db";
import { rooms } from "@/server/db/schema";
import { invalidateBrand } from "@/server/brand/brand";
import { validateRoomName } from "@/server/policy";
import { setSetting } from "@/server/settings";

export type HallFormState = { error?: string; ok?: string };

/** Título e subtítulo da página de entrada. Tudo é revalidado aqui (limites e espaços), nunca confia no navegador. */
export async function saveHallTextAction(_prev: HallFormState, formData: FormData): Promise<HallFormState> {
  const admin = await requireFullAuth("admin");
  const title = cleanLine(formData.get("title"), HALL_TITLE_MAX) || DEFAULT_HALL_TITLE;
  const subtitle = cleanLine(formData.get("subtitle"), HALL_SUBTITLE_MAX);
  await setSetting("hall_title", title, admin.id);
  await setSetting("hall_subtitle", subtitle, admin.id);
  await audit({ action: "settings.hall-text", actorId: admin.id, actorLabel: admin.username, targetType: "setting", targetId: "hall_title", details: { titulo: title } });
  revalidatePath("/", "layout");
  return { ok: "Textos da página de entrada atualizados." };
}

/** Ícone e texto do cartão de uma sala na página de entrada. Vazio volta ao padrão (ícone e texto pelo tipo de acesso). */
export async function saveRoomCardAction(_prev: HallFormState, formData: FormData): Promise<HallFormState> {
  const admin = await requireFullAuth("admin");
  const v = validateRoomName(String(formData.get("room") ?? ""));
  if (!v.ok) return { error: "Sala inválida." };
  const rawIcon = String(formData.get("icon") ?? "");
  if (rawIcon !== "" && !isRoomIcon(rawIcon)) return { error: "Ícone inválido." };
  const description = cleanLine(formData.get("description"), ROOM_DESCRIPTION_MAX);
  const changed = await db()
    .update(rooms)
    .set({ icon: rawIcon === "" ? null : rawIcon, description: description === "" ? null : description, updatedAt: new Date() })
    .where(eq(rooms.name, v.name))
    .returning({ id: rooms.id });
  if (changed.length === 0) return { error: "Sala não encontrada." };
  await audit({ action: "room.card", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: v.name, details: { icone: rawIcon || null } });
  revalidatePath("/");
  revalidatePath(`/settings/rooms/${v.name}`);
  return { ok: "Cartão da sala atualizado." };
}

/** Textos da página de saída da reunião (saiu/desconectou e removido). Vazio volta ao texto padrão. */
export async function saveExitTextsAction(_prev: HallFormState, formData: FormData): Promise<HallFormState> {
  const admin = await requireFullAuth("admin");
  const read = (name: string, max: number) => cleanLine(formData.get(name), max);
  await setSetting("exit_left_title", read("leftTitle", EXIT_TITLE_MAX), admin.id);
  await setSetting("exit_left_text", read("leftText", EXIT_TEXT_MAX), admin.id);
  await setSetting("exit_kicked_title", read("kickedTitle", EXIT_TITLE_MAX), admin.id);
  await setSetting("exit_kicked_text", read("kickedText", EXIT_TEXT_MAX), admin.id);
  await setSetting("exit_ended_title", read("endedTitle", EXIT_TITLE_MAX), admin.id);
  await setSetting("exit_ended_text", read("endedText", EXIT_TEXT_MAX), admin.id);
  invalidateBrand();
  await audit({ action: "settings.exit-text", actorId: admin.id, actorLabel: admin.username, targetType: "setting", targetId: "exit_left_title" });
  revalidatePath("/", "layout");
  return { ok: "Textos da página de saída atualizados." };
}
