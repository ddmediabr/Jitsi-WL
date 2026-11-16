import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/server/env";
import { COOKIE_PREFIX } from "./index";

/**
 * Entre a senha e o código de 2 fatores ainda não há sessão. Este cookie curto (10 min), assinado
 * (HMAC) e HttpOnly só diz QUAL usuário está no meio do login, para o limitador de tentativas
 * somar também os erros de código à conta. Não concede acesso nenhum.
 */
const NAME = `${COOKIE_PREFIX}.pending_user`;
const MAX_AGE_S = 10 * 60;

function sign(value: string): string {
  return createHmac("sha256", env().BETTER_AUTH_SECRET).update(`pending:${value}`).digest("base64url");
}

export async function setPendingUser(username: string): Promise<void> {
  const jar = await cookies();
  jar.set(NAME, `${username}.${sign(username)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/settings",
    maxAge: MAX_AGE_S,
  });
}

export async function readPendingUser(): Promise<string | null> {
  const raw = (await cookies()).get(NAME)?.value;
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i < 1) return null;
  const username = raw.slice(0, i);
  const given = Buffer.from(raw.slice(i + 1));
  const expected = Buffer.from(sign(username));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return username;
}

export async function clearPendingUser(): Promise<void> {
  (await cookies()).delete({ name: NAME, path: "/settings" });
}
