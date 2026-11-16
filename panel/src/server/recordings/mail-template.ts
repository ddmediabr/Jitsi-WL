import "server-only";
import { mailColor, MAIL_FIELDS, withDefaults, type MailField, type MailTexts } from "@/lib/mail-template";
import { getSetting } from "@/server/settings";

/** Textos do e-mail da gravação como estão salvos (vazio = padrão). */
export async function getSavedMailTexts(): Promise<Record<MailField, string>> {
  const values = await Promise.all(MAIL_FIELDS.map((f) => getSetting(`mail_recording_${f}` as const)));
  return Object.fromEntries(MAIL_FIELDS.map((f, i) => [f, values[i]])) as Record<MailField, string>;
}

/** Textos em uso (salvos, com o padrão onde estiver vazio). */
export async function getMailTexts(): Promise<MailTexts> {
  return withDefaults(await getSavedMailTexts());
}

/** Cor do cabeçalho e do botão de todos os e-mails: a do modelo ou, se vazia, a de destaque do painel. */
export async function getMailColor(): Promise<string> {
  return mailColor(await getSetting("mail_recording_color"), await getMailAccent());
}

/** Cor de destaque do painel para o e-mail (tema claro, que é o fundo do e-mail). */
export async function getMailAccent(): Promise<string> {
  return (await getSetting("accent_color_light")) || (await getSetting("accent_color")) || "#0A74E6";
}
