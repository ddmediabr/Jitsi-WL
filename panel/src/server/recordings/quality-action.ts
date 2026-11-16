"use server";

import { revalidatePath } from "next/cache";
import { isQuality, QUALITIES } from "@/lib/recording-quality";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { setSetting } from "@/server/settings";

export type QualityState = { error?: string; ok?: string };

/** Qualidade da gravação e tipo de servidor do Jibri (só o proprietário). Vale para o gravador quando ele reiniciar. */
export async function saveRecordingQualityAction(_prev: QualityState, formData: FormData): Promise<QualityState> {
  const owner = await requireFullAuth("owner");
  const quality = String(formData.get("quality") ?? "");
  const dedicated = formData.get("dedicated") === "on";
  if (!isQuality(quality)) return { error: "Escolha uma qualidade da lista." };
  if (QUALITIES[quality].needsDedicated && !dedicated) return { error: "1080p só pode ser usada com o Jibri em servidor dedicado. Marque a opção de servidor dedicado." };
  await setSetting("recording_quality", quality, owner.id);
  await setSetting("recording_dedicated", dedicated, owner.id);
  await audit({ action: "settings.recording_quality", actorId: owner.id, actorLabel: owner.username, targetType: "setting", targetId: "recording_quality", details: { quality, dedicated } });
  revalidatePath("/settings/gravacoes");
  return { ok: "Salvo. O gravador passa a usar essa qualidade na próxima vez que reiniciar." };
}
