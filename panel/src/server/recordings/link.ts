import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

/** Horas de validade do link de download enviado por e-mail. Depois disso a gravação só se baixa pelo painel. */
export const LINK_HOURS = 24;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const mac = (payload: string) => createHmac("sha256", env().BETTER_AUTH_SECRET).update(`recording-link:${payload}`).digest("base64url");

/** Token "<id>.<expira em segundos>.<assinatura>": o link é a própria credencial, sem login, e vence sozinho. */
export function signDownloadToken(id: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + LINK_HOURS * 3600;
  return `${id}.${exp}.${mac(`${id}.${exp}`)}`;
}

/** Devolve o id da gravação se o token for autêntico e ainda estiver dentro do prazo; senão null. */
export function verifyDownloadToken(token: string, now = Date.now()): string | null {
  const [id, expText, sig] = token.split(".");
  if (!id || !expText || !sig || !ID.test(id) || !/^\d{1,12}$/.test(expText)) return null;
  const given = Buffer.from(sig);
  const expected = Buffer.from(mac(`${id}.${expText}`));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Number(expText) * 1000 > now ? id : null;
}

/** Endereço público do link de download. */
export function downloadUrl(token: string): string {
  return `${new URL(env().BETTER_AUTH_URL).origin}/flow-api/recordings/download?t=${encodeURIComponent(token)}`;
}
