"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { pushPolicyNotice } from "@/server/prosody/sync";
import { setSetting } from "@/server/settings";

export type TimingsState = { error?: string; ok?: string };

// Limites iguais aos do esquema da política (policy.ts) e do Prosody: valores fora disso são recusados.
const schema = z.object({
  reconnectMinutes: z.coerce.number().int().min(1, "O passe de reconexão precisa de pelo menos 1 minuto.").max(1440, "O passe de reconexão vai até 1440 minutos (24 h)."),
  rememberHours: z.coerce.number().int().min(1, "A lembrança do navegador precisa de pelo menos 1 hora.").max(168, "A lembrança do navegador vai até 168 horas (7 dias)."),
});

export async function saveTimingsAction(_prev: TimingsState, formData: FormData): Promise<TimingsState> {
  const admin = await requireFullAuth("admin");
  const parsed = schema.safeParse({ reconnectMinutes: formData.get("reconnectMinutes"), rememberHours: formData.get("rememberHours") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Valores inválidos." };

  const reconnect = parsed.data.reconnectMinutes * 60;
  const remember = parsed.data.rememberHours * 3600;
  await setSetting("reconnect_pass_seconds", reconnect, admin.id);
  await setSetting("remember_seconds", remember, admin.id);
  await audit({
    action: "settings.timings",
    actorId: admin.id,
    actorLabel: admin.username,
    targetType: "setting",
    targetId: "timings",
    details: { reconnect_pass_seconds: reconnect, remember_seconds: remember },
  });
  const warn = await pushPolicyNotice(); // vale no servidor de reuniões sem reiniciar nada
  revalidatePath("/settings/rooms");
  return warn ? { ok: "Prazos salvos.", error: warn } : { ok: "Prazos salvos e aplicados no servidor de reuniões." };
}
