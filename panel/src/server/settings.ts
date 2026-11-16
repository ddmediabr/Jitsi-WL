import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { appSettings } from "@/server/db/schema";

/**
 * Nome padrão da marca (white label): variável BRAND_NAME do Coolify, até 40 caracteres. Vale enquanto o
 * proprietário não cadastrar o nome em Personalização, e também onde o nome é fixo (emissor do 2FA no app
 * autenticador). Sem a variável, um nome neutro.
 */
export const BRAND_DEFAULT = (process.env.BRAND_NAME ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "Meet";

/**
 * Configurações do painel, editáveis pela interface. O padrão de cada uma vale enquanto o
 * proprietário não mudar. Valores são validados no servidor antes de gravar.
 */
export const DEFAULTS: { require_2fa: boolean; reconnect_pass_seconds: number; remember_seconds: number; accent_color: string; accent_color_light: string; palette: string; entry_bg: Record<string, unknown>; button_text_dark: string; button_text_light: string; default_theme: string; brand_name: string; hall_title: string; hall_subtitle: string; exit_left_title: string; exit_left_text: string; exit_kicked_title: string; exit_kicked_text: string; exit_ended_title: string; exit_ended_text: string; recording_max_gb: number; recording_retention_days: number; timezone: string; share_fps: number; recording_quality: string; recording_dedicated: boolean; transcription_glossary: string; mail_recording_subject: string; mail_recording_title: string; mail_recording_intro: string; mail_recording_button: string; mail_recording_transcript_ok: string; mail_recording_transcript_failed: string; mail_recording_footer: string; mail_recording_color: string } = {
  /**
   * Exigir verificação em duas etapas de todos os administradores. Desligado por padrão (decisão do
   * produto: o 2FA é RECOMENDADO, não obrigatório; cada empresa white label escolhe).
   */
  require_2fa: false,
  /** Quanto tempo quem saiu da sala pode voltar sem nova aprovação (editável na Onda 4). */
  reconnect_pass_seconds: 900,
  /** Quanto tempo o navegador de um cadastrado fica "lembrado" para retomar a sessão. */
  remember_seconds: 86400,
  /** Cor de destaque (botões e realces), #RRGGBB. Fundos não são editáveis. */
  /** Cor de destaque escolhida à mão; vazio = a da paleta. */
  accent_color: "",
  /** Cor de destaque do tema claro (fundo #FFFFFF). */
  accent_color_light: "",
  /** Paleta dos temas (azul, roxo, verde, amarelo, vermelho, laranja, lima, marrom, preto e branco, cinza). */
  palette: "azul",
  /** Fundo das páginas de entrada: objeto { mode, dark, light } (veja lib/entry-bg). Vazio = sem fundo. Guardado como objeto JSON (uma string JSON seria lida em dobro pelo driver). */
  entry_bg: {},
  /** Cor do texto dos botões (sobre a cor de destaque) em cada tema, #RRGGBB. */
  button_text_dark: "",
  button_text_light: "",
  /** Tema de quem ainda não escolheu o seu ("dark" ou "light"). */
  default_theme: "dark",
  /** Nome da marca mostrado no painel e nas telas de entrada quando não há logo. */
  brand_name: BRAND_DEFAULT,
  /** Título e subtítulo da página de entrada (hall de salas). */
  hall_title: "Meeting Hall",
  hall_subtitle: "",
  /** Página de saída da reunião (vazio = texto padrão de lib/exit-texts). */
  exit_left_title: "",
  exit_left_text: "",
  exit_kicked_title: "",
  exit_kicked_text: "",
  exit_ended_title: "",
  exit_ended_text: "",
  /** Gravações: espaço máximo no servidor (GB). A limpeza começa 5 GB antes (RESERVE em recordings/purge.ts); a gravação nunca para. */
  recording_max_gb: 35,
  /** Gravações: dias que o arquivo fica no servidor antes de ser apagado. */
  recording_retention_days: 30,
  /** Fuso horário (IANA) das datas mostradas no painel e da limpeza diária. */
  timezone: "America/Sao_Paulo",
  /** Quadros por segundo do compartilhamento de tela (o Jitsi vem com 5). */
  share_fps: 15,
  /** Qualidade da gravação (480p, 720p, 900p, 1080p); 1080p só com o Jibri em servidor dedicado. */
  recording_quality: "900p",
  /** O Jibri roda em servidor dedicado (recursos próprios)? Libera 1080p e aumenta o limite estimado de gravações simultâneas. */
  recording_dedicated: false,
  /** Termos, siglas e nomes que a IA deve respeitar (um por linha ou separados por vírgula). */
  transcription_glossary: "",
  /** E-mail da gravação (textos editáveis em Configurações; vazio = padrão de lib/mail-template). */
  mail_recording_subject: "",
  mail_recording_title: "",
  mail_recording_intro: "",
  mail_recording_button: "",
  mail_recording_transcript_ok: "",
  mail_recording_transcript_failed: "",
  mail_recording_footer: "",
  mail_recording_color: "",
};

export type SettingKey = keyof typeof DEFAULTS;

export const getSetting = cache(async <K extends SettingKey>(key: K): Promise<(typeof DEFAULTS)[K]> => {
  const rows = await db().select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  const value = rows[0]?.value;
  // Só aceita o tipo esperado; qualquer coisa diferente cai no padrão.
  return (typeof value === typeof DEFAULTS[key] ? value : DEFAULTS[key]) as (typeof DEFAULTS)[K];
});

export async function setSetting<K extends SettingKey>(key: K, value: (typeof DEFAULTS)[K], actorId: string): Promise<void> {
  await db()
    .insert(appSettings)
    .values({ key, value, updatedBy: actorId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date(), updatedBy: actorId } });
}
