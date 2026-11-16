"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { db } from "@/server/db";
import { jitsiProfiles, roomAccess, rooms } from "@/server/db/schema";
import { z } from "zod";
import { MAX_PHOTO_BYTES } from "./photo";
import { changeName, changePhoto, deleteProfile, nameTaken, removePhoto } from "./profile-service";
import { MAX_MEMBERS, MAX_MODERATORS, roleOf, validateRoomName } from "@/server/policy";
import { prosodyCall } from "@/server/prosody/client";
import { pushPolicyNotice } from "@/server/prosody/sync";
import { validateDisplayName } from "./profiles";
import { generatePassword, validateUsername, weakPasswordReason } from "./rules";

/**
 * `password` só existe na resposta da ação que acabou de gerá-la: nunca é gravada (banco, auditoria
 * ou log) nem reaparece depois. O Prosody guarda apenas o hash.
 */
export type UserFormState = { error?: string; ok?: string; username?: string; password?: string };

const UNAVAILABLE = "Não foi possível falar com o servidor de reuniões agora. Tente de novo em instantes.";

/** Fala com o Prosody; devolve o status HTTP ou `null` se não deu para chegar (nada é registrado em log). */
async function callProsody(path: string, payload: unknown): Promise<number | null> {
  try {
    return (await prosodyCall("POST", path, payload)).status;
  } catch {
    return null;
  }
}

/** Senha pedida no formulário: gerada (padrão) ou digitada e validada. */
function passwordFrom(formData: FormData, username: string): { password: string; generated: boolean } | { error: string } {
  if (String(formData.get("mode") ?? "generate") !== "custom") return { password: generatePassword(username), generated: true };
  const typed = String(formData.get("password") ?? "");
  const weak = weakPasswordReason(typed, username);
  return weak ? { error: weak } : { password: typed, generated: false };
}

export async function createUserAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireFullAuth("admin");
  const v = validateUsername(String(formData.get("username") ?? ""));
  if (!v.ok) return { error: v.error };
  const display = validateDisplayName(String(formData.get("displayName") ?? ""));
  if (!display.ok) return { error: display.error };
  if (await nameTaken(display.name, v.name)) return { error: "Já existe uma conta com esse nome. Escolha outro." };
  const pw = passwordFrom(formData, v.name);
  if ("error" in pw) return { error: pw.error };

  const status = await callProsody("/users", { username: v.name, password: pw.password });
  if (status === 409) return { error: "Já existe uma conta com esse nome." };
  if (status === 400) return { error: "O servidor recusou o nome ou a senha." };
  if (status !== 200) return { error: UNAVAILABLE };

  await db()
    .insert(jitsiProfiles)
    .values({ username: v.name, displayName: display.name })
    .onConflictDoUpdate({ target: jitsiProfiles.username, set: { displayName: display.name, updatedAt: new Date() } });
  await audit({ action: "user.create", actorId: admin.id, actorLabel: admin.username, targetType: "user", targetId: v.name, details: { nome: display.name } });
  revalidatePath("/settings/users");
  return pw.generated
    ? { ok: "Conta criada. Anote a senha agora: ela não será mostrada de novo.", username: v.name, password: pw.password }
    : { ok: "Conta criada com a senha informada.", username: v.name };
}

/** Troca o nome de exibição de uma conta (o painel troca sem limite; não conta na política de trocas do usuário). */
export async function setDisplayNameAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireFullAuth("admin");
  const v = validateUsername(String(formData.get("username") ?? ""));
  if (!v.ok) return { error: "Usuário inválido." };
  const r = await changeName(v.name, String(formData.get("displayName") ?? ""), "admin");
  if (!r.ok) return { error: r.error };
  await audit({ action: "user.rename", actorId: admin.id, actorLabel: admin.username, targetType: "user", targetId: v.name, details: { por: "painel" } });
  revalidatePath("/settings/users");
  revalidatePath(`/settings/users/${v.name}`);
  return { ok: r.notice };
}

/** Troca a foto de uma conta pelo painel (mesma validação de segurança do upload do usuário; sem limite de trocas). */
export async function setPhotoAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireFullAuth("admin");
  const v = validateUsername(String(formData.get("username") ?? ""));
  if (!v.ok) return { error: "Usuário inválido." };
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha uma imagem." };
  if (file.size > MAX_PHOTO_BYTES) return { error: "A foto deve ter no máximo 2 MB." };
  const r = await changePhoto(v.name, Buffer.from(await file.arrayBuffer()), "admin");
  if (!r.ok) return { error: r.error };
  await audit({ action: "user.photo", actorId: admin.id, actorLabel: admin.username, targetType: "user", targetId: v.name, details: { por: "painel" } });
  revalidatePath(`/settings/users/${v.name}`);
  return { ok: r.notice };
}

export async function removePhotoAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("admin");
  const v = validateUsername(String(formData.get("username") ?? ""));
  if (!v.ok) redirect("/settings/users");
  await removePhoto(v.name);
  await audit({ action: "user.photo.remove", actorId: admin.id, actorLabel: admin.username, targetType: "user", targetId: v.name });
  revalidatePath(`/settings/users/${v.name}`);
  redirect(`/settings/users/${v.name}`);
}

export async function resetPasswordAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireFullAuth("admin");
  const v = validateUsername(String(formData.get("username") ?? ""));
  if (!v.ok) return { error: "Usuário inválido." };
  const pw = passwordFrom(formData, v.name);
  if ("error" in pw) return { error: pw.error };

  const status = await callProsody("/users/password", { username: v.name, password: pw.password });
  if (status === 404) return { error: "Essa conta não existe mais no servidor." };
  if (status === 400) return { error: "O servidor recusou a senha." };
  if (status !== 200) return { error: UNAVAILABLE };

  await audit({ action: "user.password.reset", actorId: admin.id, actorLabel: admin.username, targetType: "user", targetId: v.name });
  return pw.generated
    ? { ok: "Senha redefinida. Anote a nova senha agora: ela não será mostrada de novo.", username: v.name, password: pw.password }
    : { ok: "Senha redefinida com a senha informada.", username: v.name };
}

export async function deleteUserAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireFullAuth("admin");
  const v = validateUsername(String(formData.get("username") ?? ""));
  if (!v.ok) return { error: "Usuário inválido." };
  // Confirmação por digitação: evita apagar por clique acidental.
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== v.name) {
    return { error: "Digite o nome do usuário exatamente para confirmar." };
  }

  const status = await callProsody("/users/delete", { username: v.name });
  if (status !== 200 && status !== 404) return { error: UNAVAILABLE }; // 404 = já não existe: segue a limpeza

  // A conta some também das salas; a política é reenviada.
  await db().delete(roomAccess).where(eq(roomAccess.username, v.name));
  await deleteProfile(v.name);
  await audit({ action: "user.delete", actorId: admin.id, actorLabel: admin.username, targetType: "user", targetId: v.name });
  await pushPolicyNotice();
  revalidatePath("/settings/users");
  revalidatePath("/settings/rooms");
  redirect("/settings/users");
}

/** Dá à conta acesso a uma sala (moderador ou usuário comum), a partir da página da própria conta. */
export async function addUserToRoomAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireFullAuth("admin");
  const v = validateUsername(String(formData.get("username") ?? ""));
  if (!v.ok) return { error: "Usuário inválido." };
  const r = validateRoomName(String(formData.get("room") ?? ""));
  if (!r.ok) return { error: "Selecione uma sala." };
  const role = roleOf(formData.get("role"));

  const room = (await db().select().from(rooms).where(eq(rooms.name, r.name)).limit(1))[0];
  if (!room) return { error: "Sala não encontrada." };
  const limit = role === "moderator" ? MAX_MODERATORS : MAX_MEMBERS;
  const [{ n }] = await db().select({ n: count() }).from(roomAccess).where(and(eq(roomAccess.roomId, room.id), eq(roomAccess.role, role)));
  if (n >= limit) return { error: `Limite de ${limit} ${role === "moderator" ? "moderadores" : "usuários comuns"} por sala.` };

  const inserted = await db()
    .insert(roomAccess)
    .values({ roomId: room.id, username: v.name, role, addedBy: admin.id })
    .onConflictDoNothing()
    .returning({ u: roomAccess.username });
  if (inserted.length === 0) return { error: "Essa conta já tem acesso à sala." };

  await db().update(rooms).set({ updatedAt: new Date() }).where(eq(rooms.id, room.id));
  await audit({ action: "room.access.add", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: r.name, details: { usuario: v.name, papel: role } });
  const warn = await pushPolicyNotice();
  revalidatePath(`/settings/users/${v.name}`);
  revalidatePath(`/settings/rooms/${r.name}`);
  revalidatePath("/settings/rooms");
  return warn ? { ok: "Acesso concedido.", error: warn } : { ok: "Acesso concedido." };
}

/** Tira a conta da lista de acesso de uma sala, a partir da página da conta. */
export async function removeUserFromRoomAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("admin");
  const v = validateUsername(String(formData.get("username") ?? ""));
  const r = validateRoomName(String(formData.get("room") ?? ""));
  if (!v.ok) redirect("/settings/users");
  if (r.ok) {
    const room = (await db().select().from(rooms).where(eq(rooms.name, r.name)).limit(1))[0];
    if (room) {
      await db().delete(roomAccess).where(and(eq(roomAccess.roomId, room.id), eq(roomAccess.username, v.name)));
      await db().update(rooms).set({ updatedAt: new Date() }).where(eq(rooms.id, room.id));
      await audit({ action: "room.access.remove", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: r.name, details: { usuario: v.name } });
      await pushPolicyNotice();
    }
  }
  revalidatePath(`/settings/rooms`);
  redirect(`/settings/users/${v.name}`);
}

/** Remove a conta de todas as salas. A conta continua existindo, só sem acesso a sala alguma. */
export async function removeUserFromAllRoomsAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("admin");
  const v = validateUsername(String(formData.get("username") ?? ""));
  if (!v.ok) redirect("/settings/users");

  const removed = await db().delete(roomAccess).where(eq(roomAccess.username, v.name)).returning({ id: roomAccess.roomId });
  if (removed.length > 0) {
    await audit({ action: "user.rooms.clear", actorId: admin.id, actorLabel: admin.username, targetType: "user", targetId: v.name, details: { salas: removed.length } });
    await pushPolicyNotice();
  }
  revalidatePath("/settings/rooms");
  redirect(`/settings/users/${v.name}`);
}

/** Liga/desliga o Modo invisível da conta: ela poderá escolher entrar invisível nas salas em que é moderador (real). */
export async function setInvisibleAllowedAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("admin");
  const v = validateUsername(String(formData.get("username") ?? ""));
  if (!v.ok) redirect("/settings/users");
  const on = String(formData.get("invisible") ?? "") === "on";
  // A conta pode ainda não ter linha de perfil (contas antigas): cria com o próprio usuário como nome.
  await db().insert(jitsiProfiles).values({ username: v.name, displayName: v.name }).onConflictDoNothing();
  await db().update(jitsiProfiles).set({ invisibleAllowed: on, updatedAt: new Date() }).where(eq(jitsiProfiles.username, v.name));
  await audit({ action: "user.invisible", actorId: admin.id, actorLabel: admin.username, targetType: "user", targetId: v.name, details: { invisivel: on } });
  await pushPolicyNotice();
  revalidatePath(`/settings/users/${v.name}`);
  redirect(`/settings/users/${v.name}`);
}

/** E-mail opcional da conta (vazio apaga). Sem e-mail, o moderador não recebe o link de download das gravações; o painel continua baixando. */
export async function setEmailAction(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const admin = await requireFullAuth("admin");
  const v = validateUsername(String(formData.get("username") ?? ""));
  if (!v.ok) return { error: "Usuário inválido." };
  const raw = String(formData.get("email") ?? "").trim().toLowerCase();
  if (raw !== "" && !z.string().email().max(254).safeParse(raw).success) return { error: "Digite um e-mail válido ou deixe em branco." };
  await db().insert(jitsiProfiles).values({ username: v.name, displayName: v.name }).onConflictDoNothing();
  await db().update(jitsiProfiles).set({ email: raw === "" ? null : raw, updatedAt: new Date() }).where(eq(jitsiProfiles.username, v.name));
  await audit({ action: "user.email", actorId: admin.id, actorLabel: admin.username, targetType: "user", targetId: v.name, details: { definido: raw !== "" } });
  revalidatePath(`/settings/users/${v.name}`);
  return { ok: raw === "" ? "E-mail removido." : "E-mail salvo." };
}
