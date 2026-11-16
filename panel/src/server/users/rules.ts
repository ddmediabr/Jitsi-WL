import "server-only";
import { randomInt } from "node:crypto";

/* Regras de conta (espelham o esquema estrito do Prosody em mod_ddmedia_admin_api). */
export const NEW_USERNAME = /^[a-z0-9][a-z0-9._-]{1,63}$/;
export const MAX_USERS = 2000;

/** Contas internas do Jitsi/administrativas: o painel nunca as lista nem as toca. */
export const RESERVED_USERNAMES = new Set(["focus", "jvb", "jibri", "jigasi", "admin", "recorder", "transcriber"]);

export function validateUsername(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim().toLowerCase();
  if (!NEW_USERNAME.test(name)) {
    return { ok: false, error: "Use de 2 a 64 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado (começando por letra ou número)." };
  }
  if (RESERVED_USERNAMES.has(name)) return { ok: false, error: "Esse nome é reservado pelo sistema." };
  return { ok: true, name };
}

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;
const COMMON = ["senha", "password", "qwerty", "123456", "abc123", "abc@123", "admin", "jitsi", "ddmedia", "meet", "letmein", "welcome"];

/** Valida uma senha escolhida à mão. Devolve a mensagem de erro, ou null se for aceitável. */
export function weakPasswordReason(password: string, username: string): string | null {
  if (password.length < MIN_LENGTH) return `A senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`;
  if (password.length > MAX_LENGTH) return `A senha pode ter no máximo ${MAX_LENGTH} caracteres.`;
  if (/[\u0000-\u001f\u007f]/.test(password)) return "A senha não pode ter quebra de linha nem caracteres de controle.";
  const lower = password.toLowerCase();
  if (username && lower.includes(username.toLowerCase())) return "A senha não pode conter o nome do usuário.";
  if (COMMON.some((w) => lower.includes(w))) return "Essa senha é previsível. Evite palavras comuns ou use a senha gerada.";
  if (new Set(password).size < 6) return "A senha tem caracteres repetidos demais.";
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) return "Misture ao menos três tipos: minúsculas, maiúsculas, números e símbolos.";
  return null;
}

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const SPECIAL = "!@#$%&*?-_.";
const GENERATED_LENGTH = 12;

function pick(set: string): string {
  return set[randomInt(set.length)];
}

/**
 * Senha forte aleatória de 12 caracteres: ao menos 2 símbolos, 2 números, 1 maiúscula e 1 minúscula
 * (sem caracteres ambíguos como 0/O e 1/l/I). Posições embaralhadas com Fisher-Yates criptográfico.
 */
export function generatePassword(username = ""): string {
  const all = UPPER + LOWER + DIGITS + SPECIAL;
  for (;;) {
    const chars = [pick(SPECIAL), pick(SPECIAL), pick(DIGITS), pick(DIGITS), pick(UPPER), pick(LOWER)];
    while (chars.length < GENERATED_LENGTH) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const p = chars.join("");
    if (weakPasswordReason(p, username) === null) return p;
  }
}
