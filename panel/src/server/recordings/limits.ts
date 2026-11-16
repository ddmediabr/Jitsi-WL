"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { setSetting } from "@/server/settings";
import { purgeAll } from "./purge";

export type RecordingLimitsState = { error?: string; ok?: string };

const schema = z.object({
  retentionDays: z.coerce.number().int().min(1, "A retenção precisa de pelo menos 1 dia.").max(365, "A retenção vai até 365 dias."),
  maxGb: z.coerce.number().int().min(1, "O limite de espaço precisa de pelo menos 1 GB.").max(60, "O limite de espaço vai até 60 GB."),
});

/** Prazo e espaço máximo das gravações (só o proprietário). Ao salvar, já aplica a limpeza. */
export async function saveRecordingLimitsAction(_prev: RecordingLimitsState, formData: FormData): Promise<RecordingLimitsState> {
  const owner = await requireFullAuth("owner");
  const parsed = schema.safeParse({ retentionDays: formData.get("retentionDays"), maxGb: formData.get("maxGb") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Valores inválidos." };
  await setSetting("recording_retention_days", parsed.data.retentionDays, owner.id);
  await setSetting("recording_max_gb", parsed.data.maxGb, owner.id);
  await audit({
    action: "settings.recordings",
    actorId: owner.id,
    actorLabel: owner.username,
    targetType: "setting",
    targetId: "recordings",
    details: { recording_retention_days: parsed.data.retentionDays, recording_max_gb: parsed.data.maxGb },
  });
  const cleaned = await purgeAll().catch(() => ({ expired: 0, overLimit: 0 }));
  revalidatePath("/settings/configuracoes");
  const n = cleaned.expired + cleaned.overLimit;
  return { ok: n > 0 ? `Salvo. ${n} gravação(ões) antiga(s) apagada(s) para caber nos novos limites.` : "Salvo." };
}
