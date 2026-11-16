"use server";

import { revalidatePath } from "next/cache";
import { isValidTimeZone } from "@/lib/tz";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { setSetting } from "@/server/settings";

export type TimeZoneState = { error?: string; ok?: string };

/** Fuso horário de todas as datas do painel e da limpeza diária (só o proprietário). */
export async function saveTimeZoneAction(_prev: TimeZoneState, formData: FormData): Promise<TimeZoneState> {
  const owner = await requireFullAuth("owner");
  const tz = String(formData.get("timezone") ?? "");
  if (!isValidTimeZone(tz) || !Intl.supportedValuesOf("timeZone").concat("UTC").includes(tz)) return { error: "Escolha um fuso horário da lista." };
  await setSetting("timezone", tz, owner.id);
  await audit({ action: "settings.timezone", actorId: owner.id, actorLabel: owner.username, targetType: "setting", targetId: "timezone", details: { timezone: tz } });
  revalidatePath("/settings", "layout");
  return { ok: "Fuso horário salvo." };
}
