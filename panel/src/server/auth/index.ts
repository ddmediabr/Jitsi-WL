import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor, username } from "better-auth/plugins";
import { db } from "@/server/db";
import * as authSchema from "@/server/db/auth-schema";
import { env } from "@/server/env";
import { BRAND_DEFAULT, getSetting } from "@/server/settings";
import { buildResetPasswordMail, buildTwoFactorMail } from "@/lib/mail-template";
import { getMailColor } from "@/server/recordings/mail-template";
import { mailConfigured, sendMail } from "./mail";

/** Argon2id com os parâmetros mínimos recomendados pela OWASP (19 MiB, 2 passes, 1 thread). */
// `algorithm: 2` = Argon2id (o enum do pacote é "const enum" e não pode ser importado aqui).
const ARGON2 = { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** Prefixo dos cookies do painel (o proxy confere o cookie `ddadmin.session_token`). */
export const COOKIE_PREFIX = "ddadmin";
export const SESSION_MAX_AGE_S = 60 * 60 * 8; // 8 h, tempo absoluto
export const OTP_MINUTES = 5; // validade do código por e-mail

function create() {
  const e = env();
  const production = process.env.NODE_ENV === "production";
  return betterAuth({
    appName: BRAND_DEFAULT,
    baseURL: e.BETTER_AUTH_URL,
    secret: e.BETTER_AUTH_SECRET,
    basePath: "/settings/api/auth", // dentro do prefixo reservado; o handler HTTP NÃO é montado
    database: drizzleAdapter(db(), { provider: "pg", schema: authSchema }),

    // Contas só são criadas por nós (setup e administradores): nada de cadastro público.
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60, // o link vale 1 h e é de uso único
      revokeSessionsOnPasswordReset: true,
      // O handler HTTP da Better Auth não é montado: o link aponta para a nossa página /settings/reset-password.
      sendResetPassword: async ({ user, token }) => {
        if (!mailConfigured()) return;
        const link = `${e.BETTER_AUTH_URL.replace(/\/$/, "")}/settings/reset-password?token=${encodeURIComponent(token)}`;
        const brand = (await getSetting("brand_name")) || BRAND_DEFAULT;
        const mail = buildResetPasswordMail({ brand, color: await getMailColor(), name: user.name, link });
        // Sem await de propósito: o tempo de resposta não revela se o e-mail existe.
        void sendMail(user.email, mail.subject, mail.text, mail.html).catch(() => undefined);
      },
      password: {
        hash: (password) => hash(password, ARGON2),
        verify: ({ hash: stored, password }) => verify(stored, password),
      },
    },

    user: {
      additionalFields: {
        // owner | admin (qualquer outro valor = sem acesso). `input: false`: o cliente nunca consegue definir o próprio papel.
        role: { type: "string", required: true, defaultValue: "viewer", input: false },
      },
    },

    session: {
      expiresIn: SESSION_MAX_AGE_S,
      updateAge: 60 * 15,
      freshAge: 60 * 5,
    },

    advanced: {
      cookiePrefix: COOKIE_PREFIX,
      useSecureCookies: production,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "strict",
        // O cookie de sessão só viaja para /settings (nunca para o Jitsi nem para o fluxo).
        path: "/settings",
      },
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },

    plugins: [
      username({ minUsernameLength: 3, maxUsernameLength: 32 }),
      twoFactor({
        issuer: BRAND_DEFAULT,
        totpOptions: { digits: 6, period: 30 },
        backupCodeOptions: { amount: 10, length: 10 },
        // Código por e-mail: segundo fator ALTERNATIVO para contas que já ativaram o 2FA (vale 5 min, 5 tentativas, guardado só como hash).
        otpOptions: {
          period: OTP_MINUTES,
          digits: 6,
          allowedAttempts: 5,
          storeOTP: "hashed",
          sendOTP: async ({ user, otp }) => {
            if (!mailConfigured()) throw new Error("E-mail não configurado");
            const brand = (await getSetting("brand_name")) || BRAND_DEFAULT;
            const mail = buildTwoFactorMail({ brand, color: await getMailColor(), name: user.name, code: otp, minutes: OTP_MINUTES });
            await sendMail(user.email, mail.subject, mail.text, mail.html);
          },
        },
      }),
      nextCookies(), // permite definir cookies a partir de server actions
    ],
  });
}

type Auth = ReturnType<typeof create>;
const globalForAuth = globalThis as unknown as { __ddAuth?: Auth };

/** Instância única (lazy: o build não tem as variáveis de ambiente). */
export function auth(): Auth {
  if (!globalForAuth.__ddAuth) globalForAuth.__ddAuth = create();
  return globalForAuth.__ddAuth;
}
