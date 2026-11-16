/**
 * Modelos de e-mail (módulo puro: serve para o envio, no servidor, e para a prévia em Personalização).
 * `renderMail` é o layout único de todos os e-mails do sistema (gravação, redefinir senha, código de verificação).
 * O e-mail da gravação tem textos editáveis, com variáveis entre chaves duplas, ex.: {{sala}}. Campo vazio = texto padrão.
 */

/** Variáveis disponíveis nos textos (nome, para que servem). */
export const MAIL_VARS = [
  { name: "nome", help: "nome de quem recebe" },
  { name: "marca", help: "nome da marca" },
  { name: "sala", help: "nome da sala" },
  { name: "inicio", help: "data e hora do início" },
  { name: "duracao", help: "duração da gravação" },
  { name: "tamanho", help: "tamanho do arquivo" },
  { name: "horas", help: "validade do link, em horas" },
] as const;
export type MailVarName = (typeof MAIL_VARS)[number]["name"];
export type MailVars = Record<MailVarName, string>;

/** Campos editáveis. A chave é a mesma usada no banco, sem o prefixo "mail_recording_". */
export const MAIL_FIELDS = ["subject", "title", "intro", "button", "transcript_ok", "transcript_failed", "footer", "color"] as const;
export type MailField = (typeof MAIL_FIELDS)[number];
export type MailTexts = Record<MailField, string>;

export const MAIL_DEFAULTS: MailTexts = {
  subject: "{{marca}}: gravação da sala {{sala}}",
  title: "Sua gravação está pronta",
  intro: "Olá, {{nome}}.\nA gravação que você iniciou na sala {{sala}} já está disponível.",
  button: "Baixar gravação",
  transcript_ok: "A transcrição na íntegra (.txt) e a análise da reunião (.docx) seguem em anexo.",
  transcript_failed: "Não foi possível gerar a transcrição desta gravação. Você pode pedi-la de novo no painel, em Gravações.",
  footer: "O link vale por {{horas}} horas. Depois disso, a gravação só pode ser baixada pelo painel, por um administrador.",
  /** Cor do cabeçalho e do botão de TODOS os e-mails (#RRGGBB). Vazio = a cor de destaque do painel. */
  color: "",
};

export const MAIL_LIMITS: Record<MailField, number> = { subject: 150, title: 100, intro: 800, button: 40, transcript_ok: 300, transcript_failed: 300, footer: 500, color: 7 };

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isMailColor = (v: string) => HEX.test(v);

/** Texto salvo (vazio = padrão) -> texto em uso. */
export function withDefaults(saved: Partial<MailTexts>): MailTexts {
  const out = { ...MAIL_DEFAULTS };
  for (const k of MAIL_FIELDS) {
    const v = saved[k]?.trim();
    if (v) out[k] = v;
  }
  return out;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Troca {{variável}} pelo valor. Variável desconhecida fica como está. */
function fill(template: string, vars: MailVars, escape: (s: string) => string): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name: string) => (name in vars ? escape(vars[name as MailVarName]) : m));
}

/** Preto ou branco, o que ler melhor sobre a cor dada. */
function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#FFFFFF";
}

/** Cor em uso: a do modelo (se válida), senão a de destaque do painel, senão o azul padrão. */
export function mailColor(override: string, accent: string): string {
  return isMailColor(override) ? override : isMailColor(accent) ? accent : "#0A74E6";
}

export type MailLayout = {
  brand: string;
  /** #RRGGBB do cabeçalho e do botão. */
  color: string;
  title: string;
  /** Textos simples; uma quebra de linha começa outro parágrafo. */
  paragraphs: string[];
  /** Quadro de dados (rótulo, valor). */
  details?: [string, string][];
  /** Código em destaque (ex.: verificação em duas etapas). */
  code?: string;
  button?: { label: string; link: string };
  note?: { text: string; warn?: boolean };
  /** Texto pequeno no fim. */
  footer?: string;
};

const para = (text: string, style: string) =>
  text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${style}">${escapeHtml(p)}</p>`)
    .join("");

/** Layout padrão dos e-mails (texto simples e HTML em tabelas, que os leitores de e-mail aceitam). */
export function renderMail(m: MailLayout): { text: string; html: string } {
  const onColor = textOn(m.color);
  const text = [
    m.title,
    "",
    ...m.paragraphs.flatMap((p) => [p, ""]),
    ...(m.details ? [...m.details.map(([k, v]) => `${k}: ${v}`), ""] : []),
    ...(m.code ? [m.code, ""] : []),
    ...(m.button ? [`${m.button.label}:`, m.button.link, ""] : []),
    ...(m.note ? [m.note.text, ""] : []),
    ...(m.footer ? [m.footer] : []),
  ]
    .join("\n")
    .trim();

  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:90px">${escapeHtml(label)}</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600">${escapeHtml(value)}</td></tr>`;
  const body = (inner: string, pad: string) => `<tr><td style="padding:${pad}">${inner}</td></tr>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(m.title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:${m.color};padding:20px 28px;color:${onColor};font-size:18px;font-weight:700;letter-spacing:.2px">${escapeHtml(m.brand)}</td></tr>
${body(`<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#111827">${escapeHtml(m.title)}</h1>${m.paragraphs.map((p) => para(p, "margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151")).join("")}`, "28px 28px 8px")}
${m.details ? body(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #eef0f2;border-radius:8px"><tr><td style="padding:10px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${m.details.map(([k, v]) => row(k, v)).join("")}</table></td></tr></table>`, "4px 28px 8px") : ""}
${m.code ? body(`<div style="background:#f9fafb;border:1px solid #eef0f2;border-radius:8px;padding:18px;text-align:center;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#111827">${escapeHtml(m.code)}</div>`, "4px 28px 8px") : ""}
${m.button ? body(`<a href="${escapeHtml(m.button.link)}" style="display:inline-block;background:${m.color};color:${onColor};padding:13px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px">${escapeHtml(m.button.label)}</a>`, "20px 28px 8px") : ""}
${m.note ? body(`<div style="background:#f9fafb;border-left:3px solid ${m.color};padding:10px 14px;border-radius:4px;font-size:14px;line-height:1.5;color:${m.note.warn ? "#b45309" : "#374151"}">${escapeHtml(m.note.text)}</div>`, "16px 28px 0") : ""}
${body(m.footer ? para(m.footer, "margin:0 0 6px;font-size:12px;line-height:1.5;color:#6b7280") : "", "24px 28px 28px")}
</table></td></tr></table></body></html>`;
  return { text, html };
}

export type RecordingMailInput = {
  texts: MailTexts;
  vars: MailVars;
  /** Cor de destaque do painel, usada quando o modelo não define uma. */
  accent: string;
  link: string;
  /** Situação da transcrição: anexada, falhou, ou sem transcrição (não aparece nada). */
  transcript?: "ok" | "failed";
};

/** E-mail da gravação: textos do modelo (com variáveis preenchidas) no layout padrão. */
export function buildRecordingMail(input: RecordingMailInput): { subject: string; text: string; html: string } {
  const { texts, vars, link, transcript } = input;
  const f = (t: string) => fill(t, vars, (x) => x);
  const note = transcript === "ok" ? texts.transcript_ok : transcript === "failed" ? texts.transcript_failed : "";
  const { text, html } = renderMail({
    brand: vars.marca,
    color: mailColor(texts.color, input.accent),
    title: f(texts.title),
    paragraphs: [f(texts.intro)],
    details: [
      ["Sala", vars.sala],
      ["Início", vars.inicio],
      ["Duração", vars.duracao],
      ["Tamanho", vars.tamanho],
    ],
    button: { label: f(texts.button), link },
    note: note ? { text: f(note), warn: transcript === "failed" } : undefined,
    footer: f(texts.footer),
  });
  return { subject: f(texts.subject).replace(/\s+/g, " ").trim(), text, html };
}

/** Redefinição de senha (link de uso único). */
export function buildResetPasswordMail(o: { brand: string; color: string; name: string; link: string }) {
  const { text, html } = renderMail({
    brand: o.brand,
    color: o.color,
    title: "Redefinir senha",
    paragraphs: [`Olá, ${o.name}.`, "Recebemos um pedido para redefinir a senha do painel. O link vale por 1 hora e só pode ser usado uma vez."],
    button: { label: "Redefinir senha", link: o.link },
    footer: "Se você não pediu isso, ignore este e-mail: a senha atual continua valendo.",
  });
  return { subject: `${o.brand}: redefinir senha`, text, html };
}

/** Código de 6 dígitos da verificação em duas etapas. */
export function buildTwoFactorMail(o: { brand: string; color: string; name: string; code: string; minutes: number }) {
  const { text, html } = renderMail({
    brand: o.brand,
    color: o.color,
    title: "Seu código de verificação",
    paragraphs: [`Olá, ${o.name}.`, "Use o código abaixo para entrar no painel."],
    code: o.code,
    footer: `O código vale por ${o.minutes} minutos e só pode ser usado uma vez. Se não foi você, troque a sua senha: alguém pode ter descoberto a senha.`,
  });
  return { subject: `${o.brand}: seu código de verificação`, text, html };
}
