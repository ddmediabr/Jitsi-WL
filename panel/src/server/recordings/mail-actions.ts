"use server";

import { revalidatePath } from "next/cache";
import { isMailColor, MAIL_FIELDS, MAIL_LIMITS, type MailField } from "@/lib/mail-template";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { setSetting } from "@/server/settings";

export type MailFormState = { error?: string; ok?: string };

const LABELS: Record<MailField, string> = { subject: "Assunto", title: "Título", intro: "Mensagem", button: "Texto do botão", transcript_ok: "Aviso da transcrição anexada", transcript_failed: "Aviso de transcrição não gerada", footer: "Rodapé", color: "Cor" };

/** Salva os textos do e-mail da gravação (administradores). Campo vazio volta ao padrão; o botão "Restaurar padrão" limpa todos. */
export async function saveRecordingMailAction(_prev: MailFormState, formData: FormData): Promise<MailFormState> {
  const owner = await requireFullAuth("admin");
  const reset = formData.get("intent") === "reset";
  const values = {} as Record<MailField, string>;
  for (const f of MAIL_FIELDS) {
    const v = reset ? "" : String(formData.get(f) ?? "").replace(/\r/g, "").trim();
    if (v.length > MAIL_LIMITS[f]) return { error: `${LABELS[f]}: no máximo ${MAIL_LIMITS[f]} caracteres.` };
    values[f] = v;
  }
  if (values.color && !isMailColor(values.color)) return { error: "Cor inválida. Use o formato #RRGGBB." };
  for (const f of MAIL_FIELDS) await setSetting(`mail_recording_${f}` as const, values[f], owner.id);
  await audit({ action: reset ? "settings.recording_mail.reset" : "settings.recording_mail", actorId: owner.id, actorLabel: owner.username, targetType: "setting", targetId: "mail_recording", details: { personalizados: MAIL_FIELDS.filter((f) => values[f]).length } });
  revalidatePath("/settings/customize");
  return { ok: reset ? "Modelo restaurado ao padrão." : "Salvo." };
}
