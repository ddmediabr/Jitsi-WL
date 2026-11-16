// Usado SÓ pela CLI da Better Auth para gerar o esquema (npx @better-auth/cli generate).
// Precisa espelhar os plugins/campos de src/server/auth/index.ts.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor, username } from "better-auth/plugins";

export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  user: { additionalFields: { role: { type: "string", required: true, defaultValue: "viewer", input: false } } },
  plugins: [username(), twoFactor()],
});
