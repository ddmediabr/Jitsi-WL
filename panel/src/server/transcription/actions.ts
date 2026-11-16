"use server";

import { revalidatePath } from "next/cache";
import { isModelId } from "@/lib/transcription";
import { audit } from "@/server/auth/audit";
import { hasRole, requireFullAuth } from "@/server/auth/dal";
import { mailConfigured } from "@/server/auth/mail";
import { rateLimited } from "@/server/prosody/identity";
import { setSetting } from "@/server/settings";
import { enqueueTranscription } from "./queue";
import { emailTranscriptZip } from "./share";

export type TranscriptionState = { error?: string; ok?: string };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Pede a transcrição de uma gravação. Qualquer administrador pede no modo Automático (failover entre os modelos); escolher UM modelo é só do proprietário.
 */
export async function startTranscriptionAction(_prev: TranscriptionState, formData: FormData): Promise<TranscriptionState> {
  const admin = await requireFullAuth("admin");
  const id = String(formData.get("id") ?? "");
  if (!ID.test(id)) return { error: "Gravação inválida." };
  const asked = String(formData.get("model") ?? "auto");
  const model = asked !== "auto" && hasRole(admin, "owner") && isModelId(asked) ? asked : null;
  const r = await enqueueTranscription(id, model);
  if (!r.ok) return { error: r.error };
  await audit({ action: "transcript.start", actorId: admin.id, actorLabel: admin.username, targetType: "recording", targetId: id, details: { modelo: model ?? "automático" } });
  revalidatePath("/settings/gravacoes");
  return { ok: "Na fila. O resultado aparece aqui em alguns minutos." };
}

const EMAIL = /^[^\s@<>",;]{1,64}@[^\s@<>",;]{1,255}\.[^\s@<>",;]{2,}$/;

/** Envia por e-mail um .zip com a transcrição (.txt) e a análise (.docx) de uma execução pronta (qualquer administrador). */
export async function emailTranscriptAction(_prev: TranscriptionState, formData: FormData): Promise<TranscriptionState> {
  const admin = await requireFullAuth("admin");
  const id = String(formData.get("id") ?? "");
  const run = String(formData.get("run") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!ID.test(id) || !ID.test(run)) return { error: "Transcrição inválida." };
  if (email.length > 254 || !EMAIL.test(email)) return { error: "Digite um e-mail válido." };
  if (!mailConfigured()) return { error: "O envio de e-mail não está configurado no servidor." };
  if (rateLimited(`transcript-mail:${admin.id}`, 10, 600_000)) return { error: "Muitos envios. Aguarde alguns minutos." };
  try {
    const r = await emailTranscriptZip(id, run, email);
    if (!r.ok) return { error: r.error };
    // O endereço de destino não vai para a auditoria (dado pessoal); fica só o fato do envio.
    await audit({ action: "transcript.email", actorId: admin.id, actorLabel: admin.username, targetType: "recording", targetId: id, details: { sala: r.room } });
    return { ok: "Enviado. O destinatário recebe um .zip com os dois arquivos." };
  } catch {
    return { error: "Não foi possível enviar o e-mail agora. Tente de novo." };
  }
}

/** Guarda o glossário da transcrição (só o proprietário). */
export async function saveTranscriptionSettingsAction(_prev: TranscriptionState, formData: FormData): Promise<TranscriptionState> {
  const owner = await requireFullAuth("owner");
  const glossary = String(formData.get("glossary") ?? "").replace(/\r/g, "").trim().slice(0, 3000);
  await setSetting("transcription_glossary", glossary, owner.id);
  await audit({ action: "settings.transcription", actorId: owner.id, actorLabel: owner.username, targetType: "setting", targetId: "transcription", details: { termos: glossary ? glossary.split(/\n|,/).filter(Boolean).length : 0 } });
  revalidatePath("/settings/configuracoes");
  return { ok: "Salvo." };
}
