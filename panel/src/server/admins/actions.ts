"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { auth } from "@/server/auth/index";
import { clearFailures } from "@/server/auth/throttle";
import { db } from "@/server/db";
import { account, session as authSession, twoFactor, user as userTable } from "@/server/db/auth-schema";
import { generatePassword, weakPasswordReason } from "@/server/users/rules";

/**
 * Usuários do PAINEL (quem acessa /settings). Só o proprietário mexe aqui; toda ação confere o papel no servidor
 * (nunca confia na tela). `password` só existe na resposta da ação que a gerou: não vai para banco, auditoria nem log.
 */
export type PanelFormState = { error?: string; ok?: string; username?: string; password?: string };

const PANEL_USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const ROLES = new Set(["owner", "admin"]);
const GENERIC = "Não foi possível concluir. Confira os campos e tente de novo.";

function cleanUsername(raw: unknown): string | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return PANEL_USERNAME.test(v) ? v : null;
}

function passwordFrom(formData: FormData, username: string): { password: string; generated: boolean } | { error: string } {
  if (String(formData.get("mode") ?? "generate") !== "custom") return { password: generatePassword(username), generated: true };
  const typed = String(formData.get("password") ?? "");
  const weak = weakPasswordReason(typed, username);
  return weak ? { error: weak } : { password: typed, generated: false };
}

async function findByUsername(username: string) {
  const [row] = await db()
    .select({ id: userTable.id, username: userTable.username, role: userTable.role, name: userTable.name, twoFactorEnabled: userTable.twoFactorEnabled })
    .from(userTable)
    .where(eq(userTable.username, username))
    .limit(1);
  return row ?? null;
}

export async function createPanelUserAction(_prev: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const owner = await requireFullAuth("owner");
  const username = cleanUsername(formData.get("username"));
  if (!username) return { error: "Usuário inválido: de 3 a 32 caracteres (minúsculas, números, ponto, hífen ou sublinhado)." };
  const name = String(formData.get("name") ?? "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80 || /\p{C}/u.test(name)) return { error: "O nome deve ter de 2 a 80 caracteres." };
  const role = String(formData.get("role") ?? "admin");
  if (!ROLES.has(role)) return { error: GENERIC };
  const typedEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  if (typedEmail && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(typedEmail)) return { error: "E-mail inválido." };
  const email = typedEmail || `${username}@painel.invalid`;
  const pw = passwordFrom(formData, username);
  if ("error" in pw) return { error: pw.error };

  if (await findByUsername(username)) return { error: "Já existe um usuário do painel com esse nome." };
  const [mail] = await db().select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email)).limit(1);
  if (mail) return { error: "Esse e-mail já está em uso." };

  try {
    const ctx = await auth().$context;
    const hashed = await ctx.password.hash(pw.password);
    const created = await ctx.internalAdapter.createUser(
      { name, email, emailVerified: true, username, displayUsername: username, role },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({ userId: created.id, providerId: "credential", accountId: created.id, password: hashed });
  } catch {
    return { error: GENERIC };
  }
  await audit({ action: "panel.user.create", actorId: owner.id, actorLabel: owner.username, targetType: "panel-user", targetId: username, details: { papel: role } });
  revalidatePath("/settings/configuracoes");
  return pw.generated
    ? { ok: "Usuário criado. Anote a senha agora: ela não será mostrada de novo.", username, password: pw.password }
    : { ok: "Usuário criado com a senha informada.", username };
}

/** Muda o papel. O proprietário não muda o próprio papel, e nunca pode ficar sem proprietário. */
export async function changePanelRoleAction(_prev: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const owner = await requireFullAuth("owner");
  const username = cleanUsername(formData.get("username"));
  const role = String(formData.get("role") ?? "");
  if (!username || !ROLES.has(role)) return { error: GENERIC };
  if (username === owner.username) return { error: "Você não pode mudar o seu próprio papel." };

  const result = await db().transaction(async (tx): Promise<PanelFormState> => {
    // Trava os proprietários enquanto confere (duas trocas ao mesmo tempo não zeram a lista).
    const owners = await tx.select({ id: userTable.id }).from(userTable).where(eq(userTable.role, "owner")).for("update");
    const [target] = await tx.select({ id: userTable.id, role: userTable.role }).from(userTable).where(eq(userTable.username, username)).limit(1);
    if (!target) return { error: "Usuário não encontrado." };
    if (target.role === role) return { error: "Esse já é o papel atual." };
    if (target.role === "owner" && owners.length <= 1) return { error: "Precisa existir pelo menos um proprietário." };
    await tx.update(userTable).set({ role, updatedAt: new Date() }).where(eq(userTable.id, target.id));
    // Mudou de papel: as sessões abertas dele são encerradas e ele entra de novo já com o papel novo.
    await tx.delete(authSession).where(eq(authSession.userId, target.id));
    return { ok: "Papel alterado. As sessões abertas desse usuário foram encerradas." };
  });
  if (result.ok) {
    await audit({ action: "panel.user.role", actorId: owner.id, actorLabel: owner.username, targetType: "panel-user", targetId: username, details: { papel: role } });
    revalidatePath("/settings/configuracoes");
    revalidatePath(`/settings/configuracoes/usuarios/${username}`);
  }
  return result;
}

export async function resetPanelPasswordAction(_prev: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const owner = await requireFullAuth("owner");
  const username = cleanUsername(formData.get("username"));
  if (!username) return { error: GENERIC };
  if (username === owner.username) return { error: "Para trocar a sua própria senha, use a tela Segurança." };
  const target = await findByUsername(username);
  if (!target) return { error: "Usuário não encontrado." };
  const pw = passwordFrom(formData, username);
  if ("error" in pw) return { error: pw.error };

  const ctx = await auth().$context;
  const hashed = await ctx.password.hash(pw.password);
  await db().transaction(async (tx) => {
    await tx.update(account).set({ password: hashed, updatedAt: new Date() }).where(and(eq(account.userId, target.id), eq(account.providerId, "credential")));
    await tx.delete(authSession).where(eq(authSession.userId, target.id)); // a senha antiga e as sessões deixam de valer
  });
  await clearFailures([`user:${username}`]);
  await audit({ action: "panel.user.password.reset", actorId: owner.id, actorLabel: owner.username, targetType: "panel-user", targetId: username });
  return pw.generated
    ? { ok: "Senha redefinida e sessões encerradas. Anote a senha agora: ela não será mostrada de novo.", username, password: pw.password }
    : { ok: "Senha redefinida e sessões encerradas.", username };
}

/** Encerra todas as sessões abertas de um usuário do painel. */
export async function endPanelSessionsAction(_prev: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const owner = await requireFullAuth("owner");
  const username = cleanUsername(formData.get("username"));
  if (!username) return { error: GENERIC };
  const target = await findByUsername(username);
  if (!target) return { error: "Usuário não encontrado." };
  const gone = await db().delete(authSession).where(eq(authSession.userId, target.id)).returning({ id: authSession.id });
  await audit({ action: "panel.user.sessions.end", actorId: owner.id, actorLabel: owner.username, targetType: "panel-user", targetId: username, details: { sessoes: gone.length } });
  return { ok: gone.length > 0 ? `${gone.length} sessão(ões) encerrada(s).` : "Esse usuário não tinha sessões abertas." };
}

/** Remove a verificação em duas etapas de outro usuário (perdeu o celular). Ele cadastra de novo no próximo acesso. */
export async function resetPanelTwoFactorAction(_prev: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const owner = await requireFullAuth("owner");
  const username = cleanUsername(formData.get("username"));
  if (!username) return { error: GENERIC };
  if (username === owner.username) return { error: "Para mexer no seu próprio 2FA, use a tela Segurança." };
  const target = await findByUsername(username);
  if (!target) return { error: "Usuário não encontrado." };
  await db().transaction(async (tx) => {
    await tx.delete(twoFactor).where(eq(twoFactor.userId, target.id));
    await tx.update(userTable).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(userTable.id, target.id));
    await tx.delete(authSession).where(eq(authSession.userId, target.id));
  });
  await audit({ action: "panel.user.2fa.reset", actorId: owner.id, actorLabel: owner.username, targetType: "panel-user", targetId: username });
  revalidatePath(`/settings/configuracoes/usuarios/${username}`);
  return { ok: "Verificação em duas etapas removida e sessões encerradas." };
}

/** Apaga o usuário. Pede o nome para confirmar; não apaga a si mesmo nem o último proprietário. */
export async function deletePanelUserAction(_prev: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const owner = await requireFullAuth("owner");
  const username = cleanUsername(formData.get("username"));
  if (!username) return { error: GENERIC };
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== username) return { error: "O nome digitado não confere." };
  if (username === owner.username) return { error: "Você não pode apagar a sua própria conta." };

  const result = await db().transaction(async (tx): Promise<PanelFormState> => {
    const owners = await tx.select({ id: userTable.id }).from(userTable).where(eq(userTable.role, "owner")).for("update");
    const [target] = await tx.select({ id: userTable.id, role: userTable.role }).from(userTable).where(eq(userTable.username, username)).limit(1);
    if (!target) return { error: "Usuário não encontrado." };
    if (target.role === "owner" && owners.length <= 1) return { error: "Precisa existir pelo menos um proprietário." };
    await tx.delete(userTable).where(eq(userTable.id, target.id)); // sessões, contas e 2FA saem por cascata
    return { ok: "ok" };
  });
  if (!result.ok) return result;
  await audit({ action: "panel.user.delete", actorId: owner.id, actorLabel: owner.username, targetType: "panel-user", targetId: username });
  revalidatePath("/settings/configuracoes");
  redirect("/settings/configuracoes?aba=usuarios");
}
