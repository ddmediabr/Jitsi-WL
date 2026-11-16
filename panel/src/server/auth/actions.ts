"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { and, count, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { z } from "zod";
import { db, pgPool } from "@/server/db";
import { session as authSession, user as userTable } from "@/server/db/auth-schema";
import { env } from "@/server/env";
import { getSetting, setSetting } from "@/server/settings";
import { audit } from "./audit";
import { requireFullAuth, requireSession } from "./dal";
import { auth } from "./index";
import { clearPendingUser, readPendingUser, setPendingUser } from "./pending";
import { mailConfigured } from "./mail";
import { clientInfo } from "./request";
import { clearFailures, isLocked, LIMIT_PER_IP, LIMIT_PER_USER, registerFailure } from "./throttle";

/* Mensagens genéricas de propósito: não revelam se o usuário existe nem qual campo falhou. */
const MSG_INVALID = "Usuário ou senha inválidos.";
const MSG_LOCKED = "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
const MSG_CODE = "Código inválido.";
const MSG_FIELDS = "Confira os campos e tente de novo.";

export type FormState = { error?: string; ok?: string };

/** Compara dois textos em tempo constante (sem vazar o tamanho por tempo). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/);
const passwordSchema = z.string().min(12).max(128);

/* ------------------------------------------------------------------------------------------ */
/* Login                                                                                       */
/* ------------------------------------------------------------------------------------------ */

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = z
    .object({ username: usernameSchema, password: z.string().min(1).max(256) })
    .safeParse({ username: formData.get("username"), password: formData.get("password") });

  const { ip, headers } = await clientInfo();
  const username = parsed.success ? parsed.data.username : "";
  const keys = [`user:${username || "invalido"}`, `ip:${ip}`];

  if (await isLocked(keys)) {
    await audit({ action: "auth.login.locked", actorLabel: username || null });
    return { error: MSG_LOCKED };
  }
  if (!parsed.success) {
    await registerFailure(`ip:${ip}`, LIMIT_PER_IP);
    return { error: MSG_INVALID };
  }

  let needsTwoFactor = false;
  try {
    const result = (await auth().api.signInUsername({
      body: { username: parsed.data.username, password: parsed.data.password },
      headers,
    })) as { twoFactorRedirect?: boolean };
    needsTwoFactor = result.twoFactorRedirect === true;
  } catch {
    await registerFailure(keys[0], LIMIT_PER_USER);
    await registerFailure(keys[1], LIMIT_PER_IP);
    await audit({ action: "auth.login.failure", actorLabel: username });
    return { error: MSG_INVALID };
  }

  if (needsTwoFactor) {
    await setPendingUser(username);
    await audit({ action: "auth.login.password-ok", actorLabel: username });
    redirect("/settings/login/2fa");
  }
  await clearFailures([keys[0]]);
  await audit({ action: "auth.login.success", actorLabel: username });
  redirect("/settings");
}

async function verifySecondFactor(
  kind: "totp" | "backup" | "email",
  formData: FormData,
): Promise<FormState> {
  const username = await readPendingUser();
  if (!username) redirect("/settings/login");

  // TOTP: só dígitos. Recuperação: o formato da Better Auth tem hífen (XXXXX-XXXXX), mantido como veio.
  const raw = String(formData.get("code") ?? "").trim();
  const code = kind === "backup" ? raw : raw.replace(/\s/g, "");
  const valid = kind === "backup" ? /^[A-Za-z0-9-]{6,24}$/.test(code) : /^\d{6}$/.test(code);
  const { ip, headers } = await clientInfo();
  const keys = [`user:${username}`, `ip:${ip}`];

  if (await isLocked(keys)) {
    await audit({ action: "auth.2fa.locked", actorLabel: username });
    return { error: MSG_LOCKED };
  }
  if (!valid) {
    await registerFailure(keys[0], LIMIT_PER_USER);
    await registerFailure(keys[1], LIMIT_PER_IP);
    return { error: MSG_CODE };
  }
  try {
    if (kind === "totp") await auth().api.verifyTOTP({ body: { code }, headers });
    else if (kind === "email") await auth().api.verifyTwoFactorOTP({ body: { code }, headers });
    else await auth().api.verifyBackupCode({ body: { code }, headers });
  } catch {
    await registerFailure(keys[0], LIMIT_PER_USER);
    await registerFailure(keys[1], LIMIT_PER_IP);
    await audit({ action: `auth.2fa.${kind}.failure`, actorLabel: username });
    return { error: MSG_CODE };
  }
  await clearFailures([keys[0]]);
  await clearPendingUser();
  await audit({ action: `auth.login.success`, actorLabel: username, details: { segundoFator: kind } });
  redirect("/settings");
}

export async function totpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return verifySecondFactor("totp", formData);
}

export async function backupCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return verifySecondFactor("backup", formData);
}

export async function emailCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return verifySecondFactor("email", formData);
}

/** Envia o código de 6 dígitos para o e-mail da conta que acabou de acertar a senha. Cada pedido conta no limite (anti-abuso). */
export async function sendEmailCodeAction(): Promise<FormState> {
  const username = await readPendingUser();
  if (!username) redirect("/settings/login");
  if (!mailConfigured()) return { error: "O envio de e-mail ainda não foi configurado neste painel." };
  const { ip, headers } = await clientInfo();
  const keys = [`otp:user:${username}`, `otp:ip:${ip}`];
  if (await isLocked(keys)) return { error: MSG_LOCKED };
  await registerFailure(keys[0], 5);
  await registerFailure(keys[1], 20);
  try {
    await auth().api.sendTwoFactorOTP({ headers });
  } catch {
    await audit({ action: "auth.2fa.email.send-failure", actorLabel: username });
    return { error: "Não foi possível enviar o código agora. Use o aplicativo autenticador ou tente de novo em instantes." };
  }
  await audit({ action: "auth.2fa.email.sent", actorLabel: username });
  return { ok: "Enviamos um código de 6 dígitos para o e-mail da conta. Ele vale por 5 minutos." };
}

export async function logoutAction(): Promise<void> {
  const admin = await requireSession();
  const { headers } = await clientInfo();
  try {
    await auth().api.signOut({ headers });
  } catch {
    /* sessão já inválida: segue para o login */
  }
  await audit({ action: "auth.logout", actorId: admin.id, actorLabel: admin.username });
  redirect("/settings/login");
}

/* ------------------------------------------------------------------------------------------ */
/* Primeiro administrador (uso único)                                                          */
/* ------------------------------------------------------------------------------------------ */

const SETUP_LOCK_KEY = 7_340_001; // chave de advisory lock (evita dois setups ao mesmo tempo)

export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ip } = await clientInfo();
  const keys = [`setup:${ip}`];
  if (await isLocked(keys)) return { error: MSG_LOCKED };

  const parsed = z
    .object({
      token: z.string().min(1).max(256),
      username: usernameSchema,
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().toLowerCase().email().max(160),
      password: passwordSchema,
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm)
    .safeParse(Object.fromEntries(formData));

  const expected = env().SETUP_TOKEN;
  const tokenOk = !!expected && safeEqual(String(formData.get("token") ?? ""), expected);
  if (!tokenOk || !parsed.success) {
    await registerFailure(keys[0], 5);
    await audit({ action: "setup.failure" });
    // Mesma mensagem para token errado e campos inválidos.
    return { error: tokenOk ? MSG_FIELDS : "Token de configuração inválido." };
  }

  const client = await pgPool().connect();
  try {
    await client.query("select pg_advisory_lock($1)", [SETUP_LOCK_KEY]);
    const [{ n }] = await db().select({ n: count() }).from(userTable);
    if (n > 0) return { error: "A configuração inicial já foi concluída." };

    const ctx = await auth().$context;
    const hashed = await ctx.password.hash(parsed.data.password);
    const created = await ctx.internalAdapter.createUser(
      {
        name: parsed.data.name,
        email: parsed.data.email,
        emailVerified: true,
        username: parsed.data.username,
        displayUsername: parsed.data.username,
        role: "owner",
      },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: created.id,
      providerId: "credential",
      accountId: created.id,
      password: hashed,
    });
    await audit({ action: "setup.completed", actorId: created.id, actorLabel: parsed.data.username });
  } finally {
    await client.query("select pg_advisory_unlock($1)", [SETUP_LOCK_KEY]).catch(() => undefined);
    client.release();
  }
  redirect("/settings/login?configurado=1");
}

/* ------------------------------------------------------------------------------------------ */
/* 2FA (obrigatório)                                                                           */
/* ------------------------------------------------------------------------------------------ */

export type TwoFactorStart = FormState & { qr?: string; secret?: string; backupCodes?: string[] };

export async function startTwoFactorAction(_prev: TwoFactorStart, formData: FormData): Promise<TwoFactorStart> {
  const admin = await requireSession();
  if (admin.twoFactorEnabled) return { error: "A verificação em duas etapas já está ativa." };

  const { headers } = await clientInfo();
  const keys = [`user:${admin.username}`];
  if (await isLocked(keys)) return { error: MSG_LOCKED };

  const password = String(formData.get("password") ?? "");
  try {
    const result = (await auth().api.enableTwoFactor({ body: { password }, headers })) as {
      totpURI: string;
      backupCodes: string[];
    };
    const secret = new URL(result.totpURI).searchParams.get("secret") ?? "";
    const qr = await QRCode.toDataURL(result.totpURI, { margin: 1, width: 224, errorCorrectionLevel: "M" });
    await audit({ action: "auth.2fa.enroll.started", actorId: admin.id, actorLabel: admin.username });
    return { qr, secret, backupCodes: result.backupCodes };
  } catch {
    await registerFailure(keys[0], LIMIT_PER_USER);
    await audit({ action: "auth.2fa.enroll.failure", actorId: admin.id, actorLabel: admin.username });
    return { error: "Senha incorreta." };
  }
}

export async function confirmTwoFactorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireSession();
  const { headers } = await clientInfo();
  const keys = [`user:${admin.username}`];
  if (await isLocked(keys)) return { error: MSG_LOCKED };

  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: MSG_CODE };
  try {
    await auth().api.verifyTOTP({ body: { code }, headers });
  } catch {
    await registerFailure(keys[0], LIMIT_PER_USER);
    return { error: MSG_CODE };
  }
  await clearFailures(keys);
  await audit({ action: "auth.2fa.enabled", actorId: admin.id, actorLabel: admin.username });
  redirect("/settings/security");
}

/** Desativa o 2FA da própria conta (pede a senha). Bloqueado se o painel exigir 2FA. */
export async function disableTwoFactorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireFullAuth();
  if (await getSetting("require_2fa")) {
    return { error: "O painel exige verificação em duas etapas: não é possível desativar." };
  }
  const { headers } = await clientInfo();
  const keys = [`user:${admin.username}`];
  if (await isLocked(keys)) return { error: MSG_LOCKED };
  try {
    await auth().api.disableTwoFactor({ body: { password: String(formData.get("password") ?? "") }, headers });
  } catch {
    await registerFailure(keys[0], LIMIT_PER_USER);
    await audit({ action: "auth.2fa.disable.failure", actorId: admin.id, actorLabel: admin.username });
    return { error: "Senha incorreta." };
  }
  await clearFailures(keys);
  await audit({ action: "auth.2fa.disabled", actorId: admin.id, actorLabel: admin.username });
  redirect("/settings/security");
}

/** Só o proprietário: liga/desliga a exigência de 2FA para todos os administradores. */
export async function setRequireTwoFactorAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("owner");
  const value = formData.get("value") === "on";
  await setSetting("require_2fa", value, admin.id);
  await audit({
    action: "settings.require_2fa",
    actorId: admin.id,
    actorLabel: admin.username,
    details: { valor: value },
  });
  redirect("/settings/configuracoes");
}

/* ------------------------------------------------------------------------------------------ */
/* Conta: senha e sessões                                                                      */
/* ------------------------------------------------------------------------------------------ */

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireFullAuth();
  const parsed = z
    .object({ current: z.string().min(1).max(256), next: passwordSchema, confirm: z.string() })
    .refine((v) => v.next === v.confirm && v.next !== v.current)
    .safeParse({
      current: formData.get("current"),
      next: formData.get("next"),
      confirm: formData.get("confirm"),
    });
  if (!parsed.success) return { error: "A nova senha precisa ter 12+ caracteres, ser diferente da atual e igual à confirmação." };

  const { headers } = await clientInfo();
  const keys = [`user:${admin.username}`];
  if (await isLocked(keys)) return { error: MSG_LOCKED };
  try {
    await auth().api.changePassword({
      body: { currentPassword: parsed.data.current, newPassword: parsed.data.next, revokeOtherSessions: true },
      headers,
    });
  } catch {
    await registerFailure(keys[0], LIMIT_PER_USER);
    await audit({ action: "auth.password.change.failure", actorId: admin.id, actorLabel: admin.username });
    return { error: "Senha atual incorreta." };
  }
  await clearFailures(keys);
  await audit({ action: "auth.password.changed", actorId: admin.id, actorLabel: admin.username });
  return { ok: "Senha alterada. As outras sessões foram encerradas." };
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth();
  const id = String(formData.get("sessionId") ?? "");
  // Só apaga sessão do PRÓPRIO usuário e nunca a atual (a condição vai na própria consulta).
  const removed = await db()
    .delete(authSession)
    .where(and(eq(authSession.id, id), eq(authSession.userId, admin.id), ne(authSession.id, admin.sessionId)))
    .returning({ id: authSession.id });
  if (removed.length > 0) {
    await audit({ action: "auth.session.revoked", actorId: admin.id, actorLabel: admin.username, targetType: "session", targetId: id });
  }
  redirect("/settings/security");
}

/* ------------------------------------------------------------------------------------------ */
/* Esqueci minha senha (por e-mail; exige SMTP configurado)                                    */
/* ------------------------------------------------------------------------------------------ */

const MSG_RESET_SENT = "Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha. Ele vale por 1 hora.";

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!mailConfigured()) return { error: "O envio de e-mail ainda não foi configurado neste painel." };
  const { ip, headers } = await clientInfo();
  const keys = [`forgot:${ip}`];
  if (await isLocked(keys)) return { error: MSG_LOCKED };
  // Todo pedido conta (não só falhas): quem tenta pedir muitos links é barrado por 15 min.
  await registerFailure(keys[0], 5);

  const parsed = z.string().trim().toLowerCase().email().max(160).safeParse(formData.get("email"));
  if (!parsed.success) return { error: "Digite um e-mail válido." };
  try {
    await auth().api.requestPasswordReset({ body: { email: parsed.data }, headers });
  } catch {
    /* mesma resposta para qualquer caso: não revela se o e-mail existe */
  }
  await audit({ action: "auth.password.reset.requested" });
  return { ok: MSG_RESET_SENT };
}

export async function resetPasswordWithTokenAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { ip, headers } = await clientInfo();
  const keys = [`reset:${ip}`];
  if (await isLocked(keys)) return { error: MSG_LOCKED };

  const parsed = z
    .object({ token: z.string().min(10).max(256), next: passwordSchema, confirm: z.string() })
    .refine((v) => v.next === v.confirm)
    .safeParse({ token: formData.get("token"), next: formData.get("next"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: "A senha precisa ter 12+ caracteres e ser igual à confirmação." };

  try {
    await auth().api.resetPassword({ body: { newPassword: parsed.data.next, token: parsed.data.token }, headers });
  } catch {
    await registerFailure(keys[0], 10);
    return { error: "Link inválido ou expirado. Peça um novo." };
  }
  await audit({ action: "auth.password.reset.completed" });
  redirect("/settings/login?senha=1");
}
