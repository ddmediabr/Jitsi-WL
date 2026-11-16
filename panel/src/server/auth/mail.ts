import "server-only";
import { env } from "@/server/env";

/**
 * E-mail pelo Resend (API HTTP, sem biblioteca). Só existe se o Coolify tiver RESEND_API_KEY e MAIL_FROM
 * (remetente de um domínio verificado no Resend, ex.: "Minha Empresa <no-reply@minhaempresa.com.br>").
 * Sem isso, "esqueci minha senha" e o código por e-mail ficam indisponíveis.
 */
export function mailConfigured(): boolean {
  const e = env();
  return !!e.RESEND_API_KEY && !!e.MAIL_FROM;
}

const RESEND_URL = "https://api.resend.com/emails";

export type MailAttachment = { filename: string; content: Buffer };

export async function sendMail(to: string, subject: string, text: string, html: string, attachments: MailAttachment[] = []): Promise<void> {
  const e = env();
  if (!e.RESEND_API_KEY || !e.MAIL_FROM) throw new Error("E-mail não configurado");
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: e.MAIL_FROM, to: [to], subject, text, html, ...(attachments.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) } : {}) }),
    signal: AbortSignal.timeout(attachments.length ? 30_000 : 10_000),
    cache: "no-store",
  });
  if (!res.ok) {
    // O corpo do Resend explica o motivo (domínio não verificado, chave inválida...), mas nunca vai para quem usa o painel.
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Resend respondeu ${res.status}: ${detail}`);
  }
}
