"use server";

import { and, eq } from "drizzle-orm";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { auth } from "@/server/auth/index";
import { clearFailures, isLocked, registerFailure } from "@/server/auth/throttle";
import { db } from "@/server/db";
import { account } from "@/server/db/auth-schema";
import { rateLimited } from "@/server/prosody/identity";
import { recorderRestartConfigured, recordingMayBeRunning, restartRecorder } from "./restart";

export type RestartState = { error?: string; ok?: string; needsForce?: boolean };

/**
 * "Aplicar agora": reinicia o gravador para ele pegar a qualidade escolhida. Proteções: só o proprietário, senha digitada de novo
 * (anti-força-bruta próprio), no máximo 3 pedidos a cada 10 minutos, recusa se parecer haver gravação em andamento (a menos que
 * confirmem), e tudo vai para a auditoria (sem o token).
 */
export async function restartRecorderAction(_prev: RestartState, formData: FormData): Promise<RestartState> {
  const owner = await requireFullAuth("owner");
  if (!recorderRestartConfigured()) return { error: "O reinício pelo painel não está configurado." };
  if (rateLimited(`recorder-restart:${owner.id}`, 3, 600_000)) return { error: "Muitos pedidos. Aguarde alguns minutos." };

  const key = `restart-pw:${owner.id}`;
  if (await isLocked([key])) return { error: "Muitas tentativas de senha. Aguarde alguns minutos." };
  const typed = String(formData.get("password") ?? "");
  const [cred] = await db().select({ hash: account.password }).from(account).where(and(eq(account.userId, owner.id), eq(account.providerId, "credential"))).limit(1);
  const ctx = await auth().$context;
  const valid = !!cred?.hash && typed.length > 0 && (await ctx.password.verify({ hash: cred.hash, password: typed }));
  if (!valid) {
    await registerFailure(key, 5);
    await audit({ action: "settings.recorder_restart.denied", actorId: owner.id, actorLabel: owner.username, targetType: "service", targetId: "jibri", details: { motivo: "senha" } });
    return { error: "Senha incorreta." };
  }
  await clearFailures([key]);

  if (formData.get("force") !== "on" && (await recordingMayBeRunning())) {
    return { error: "Parece haver uma gravação em andamento. Reiniciar o gravador agora a cortaria.", needsForce: true };
  }

  const r = await restartRecorder();
  await audit({ action: "settings.recorder_restart", actorId: owner.id, actorLabel: owner.username, targetType: "service", targetId: "jibri", details: { ok: r.ok, forcado: formData.get("force") === "on" } });
  return r.ok ? { ok: "Reiniciando o gravador. Em cerca de 1 a 2 minutos ele estará pronto, já com a qualidade escolhida." } : { error: r.error };
}
