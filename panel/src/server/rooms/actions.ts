"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { db } from "@/server/db";
import { roomAccess, rooms } from "@/server/db/schema";
import { MAX_MEMBERS, MAX_MODERATORS, MAX_ROOMS, MODERATOR_NAME, roleOf, validateRoomName, type AccessRole } from "@/server/policy";
import { pushPolicyNotice, syncPolicy } from "@/server/prosody/sync";
import { ttlSeconds } from "@/lib/temporary-rooms";

export type FormState = { error?: string; ok?: string };

const pushPolicy = pushPolicyNotice;

const ROLE_LABEL: Record<AccessRole, string> = { moderator: "Moderador", member: "Usuário comum" };

/** Nome vindo da URL/formulário: só letras/números/hífen/sublinhado; nada de caminhos. */
function roomNameOf(raw: FormDataEntryValue | null): string | null {
  const v = validateRoomName(String(raw ?? ""));
  return v.ok ? v.name : null;
}

export async function createRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireFullAuth("admin");
  const v = validateRoomName(String(formData.get("name") ?? ""));
  if (!v.ok) return { error: v.error };

  const [{ n }] = await db().select({ n: count() }).from(rooms);
  if (n >= MAX_ROOMS) return { error: `Limite de ${MAX_ROOMS} salas atingido.` };

  // Sala temporária: prazo de existência (depois dele a sala é apagada).
  let temporary: { kind: "temporary"; expiresAt: Date } | null = null;
  if (String(formData.get("kind") ?? "permanent") === "temporary") {
    const secs = ttlSeconds(String(formData.get("ttl") ?? ""));
    if (!secs) return { error: "Escolha o prazo de existência." };
    temporary = { kind: "temporary", expiresAt: new Date(Date.now() + secs * 1000) };
  }

  const inserted = await db()
    .insert(rooms)
    .values({ name: v.name, createdBy: admin.id, ...(temporary ?? {}) })
    .onConflictDoNothing()
    .returning({ id: rooms.id });
  if (inserted.length === 0) return { error: "Já existe uma sala com esse nome." };

  await audit({
    action: "room.create",
    actorId: admin.id,
    actorLabel: admin.username,
    targetType: "room",
    targetId: v.name,
    details: temporary ? { tipo: "temporaria", expira: temporary.expiresAt.toISOString() } : { tipo: "permanente" },
  });
  await pushPolicy();
  redirect(`/settings/rooms/${v.name}`);
}

/** Muda o prazo de existência de uma sala temporária (o prazo novo conta a partir de agora). */
export async function updateTemporaryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireFullAuth("admin");
  const name = roomNameOf(formData.get("room"));
  if (!name) return { error: "Sala inválida." };
  const secs = ttlSeconds(String(formData.get("ttl") ?? ""));
  if (!secs) return { error: "Escolha o novo prazo." };

  const expiresAt = new Date(Date.now() + secs * 1000);
  const changed = await db()
    .update(rooms)
    .set({ expiresAt, updatedAt: new Date() })
    .where(and(eq(rooms.name, name), eq(rooms.kind, "temporary")))
    .returning({ id: rooms.id });
  if (changed.length === 0) return { error: "Esta sala não é temporária." };

  await audit({ action: "room.temporary.update", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: name, details: { expira: expiresAt.toISOString() } });
  const warn = await pushPolicy();
  revalidatePath(`/settings/rooms/${name}`);
  revalidatePath("/settings/rooms");
  return warn ? { ok: "Salvo.", error: warn } : { ok: "Salvo." };
}

/** Transforma uma sala temporária em permanente (some o prazo). */
export async function makePermanentAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("admin");
  const name = roomNameOf(formData.get("room"));
  if (!name) redirect("/settings/rooms");
  const changed = await db()
    .update(rooms)
    .set({ kind: "permanent", expiresAt: null, updatedAt: new Date() })
    .where(and(eq(rooms.name, name), eq(rooms.kind, "temporary")))
    .returning({ id: rooms.id });
  if (changed.length > 0) {
    await audit({ action: "room.temporary.permanent", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: name });
    await pushPolicy();
  }
  revalidatePath(`/settings/rooms/${name}`);
  revalidatePath("/settings/rooms");
  redirect(`/settings/rooms/${name}`);
}

export async function addAccessAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireFullAuth("admin");
  const name = roomNameOf(formData.get("room"));
  const role = roleOf(formData.get("role"));
  const parsed = z.string().trim().toLowerCase().regex(MODERATOR_NAME).safeParse(formData.get("username"));
  if (!name) return { error: "Sala inválida." };
  if (!parsed.success) return { error: "Usuário inválido: use letras, números, ponto, hífen ou sublinhado (até 64)." };

  const room = (await db().select().from(rooms).where(eq(rooms.name, name)).limit(1))[0];
  if (!room) return { error: "Sala não encontrada." };

  const limit = role === "moderator" ? MAX_MODERATORS : MAX_MEMBERS;
  const [{ n }] = await db().select({ n: count() }).from(roomAccess).where(and(eq(roomAccess.roomId, room.id), eq(roomAccess.role, role)));
  if (n >= limit) return { error: `Limite de ${limit} ${role === "moderator" ? "moderadores" : "usuários comuns"} por sala.` };

  const inserted = await db()
    .insert(roomAccess)
    .values({ roomId: room.id, username: parsed.data, role, addedBy: admin.id })
    .onConflictDoNothing()
    .returning({ u: roomAccess.username });
  if (inserted.length === 0) return { error: "Esse usuário já tem acesso à sala." };

  await db().update(rooms).set({ updatedAt: new Date() }).where(eq(rooms.id, room.id));
  await audit({ action: "room.access.add", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: name, details: { usuario: parsed.data, papel: role } });
  const warn = await pushPolicy();
  revalidatePath(`/settings/rooms/${name}`);
  revalidatePath("/settings/rooms");
  const ok = `${ROLE_LABEL[role]} adicionado.`;
  return warn ? { ok, error: warn } : { ok };
}

/** Troca o papel de quem já tem acesso (moderador <-> usuário comum). */
export async function setAccessRoleAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("admin");
  const name = roomNameOf(formData.get("room"));
  const role = roleOf(formData.get("role"));
  const parsed = z.string().trim().toLowerCase().regex(MODERATOR_NAME).safeParse(formData.get("username"));
  if (!name || !parsed.success) redirect("/settings/rooms");

  const room = (await db().select().from(rooms).where(eq(rooms.name, name)).limit(1))[0];
  if (room) {
    const limit = role === "moderator" ? MAX_MODERATORS : MAX_MEMBERS;
    const [{ n }] = await db().select({ n: count() }).from(roomAccess).where(and(eq(roomAccess.roomId, room.id), eq(roomAccess.role, role)));
    if (n < limit) {
      const changed = await db()
        .update(roomAccess)
        .set({ role })
        .where(and(eq(roomAccess.roomId, room.id), eq(roomAccess.username, parsed.data)))
        .returning({ u: roomAccess.username });
      if (changed.length > 0) {
        await db().update(rooms).set({ updatedAt: new Date() }).where(eq(rooms.id, room.id));
        await audit({ action: "room.access.role", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: name, details: { usuario: parsed.data, papel: role } });
        await pushPolicy();
      }
    }
  }
  revalidatePath("/settings/rooms");
  redirect(`/settings/rooms/${name}`);
}

export async function removeAccessAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("admin");
  const name = roomNameOf(formData.get("room"));
  const parsed = z.string().trim().toLowerCase().regex(MODERATOR_NAME).safeParse(formData.get("username"));
  if (!name || !parsed.success) redirect("/settings/rooms");

  const room = (await db().select().from(rooms).where(eq(rooms.name, name)).limit(1))[0];
  if (room) {
    await db().delete(roomAccess).where(and(eq(roomAccess.roomId, room.id), eq(roomAccess.username, parsed.data)));
    await db().update(rooms).set({ updatedAt: new Date() }).where(eq(rooms.id, room.id));
    await audit({ action: "room.access.remove", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: name, details: { usuario: parsed.data } });
    await pushPolicy();
  }
  redirect(`/settings/rooms/${name}`);
}

/** Dá/tira de um usuário comum o direito de iniciar a reunião sozinho (sem virar moderador). */
export async function setStarterAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("admin");
  const name = roomNameOf(formData.get("room"));
  const parsed = z.string().trim().toLowerCase().regex(MODERATOR_NAME).safeParse(formData.get("username"));
  if (!name || !parsed.success) redirect("/settings/rooms");
  const canStart = String(formData.get("canStart") ?? "") === "on";

  const room = (await db().select().from(rooms).where(eq(rooms.name, name)).limit(1))[0];
  if (room) {
    const changed = await db()
      .update(roomAccess)
      .set({ canStart })
      .where(and(eq(roomAccess.roomId, room.id), eq(roomAccess.username, parsed.data), eq(roomAccess.role, "member")))
      .returning({ u: roomAccess.username });
    if (changed.length > 0) {
      await db().update(rooms).set({ updatedAt: new Date() }).where(eq(rooms.id, room.id));
      await audit({ action: "room.access.start", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: name, details: { usuario: parsed.data, iniciaReuniao: canStart } });
      await pushPolicy();
    }
  }
  revalidatePath(`/settings/rooms/${name}`);
  redirect(`/settings/rooms/${name}`);
}

/** Liga/desliga o modo de sala exclusiva (só a lista de acesso entra; os demais são barrados). */
export async function setExclusiveAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("admin");
  const name = roomNameOf(formData.get("room"));
  if (!name) redirect("/settings/rooms");
  const exclusive = String(formData.get("exclusive") ?? "") === "on";

  const changed = await db().update(rooms).set({ exclusive, updatedAt: new Date() }).where(eq(rooms.name, name)).returning({ id: rooms.id });
  if (changed.length > 0) {
    await audit({ action: "room.exclusive", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: name, details: { exclusiva: exclusive } });
    await pushPolicy();
  }
  revalidatePath(`/settings/rooms/${name}`);
  redirect(`/settings/rooms/${name}`);
}

export async function deleteRoomAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireFullAuth("admin");
  const name = roomNameOf(formData.get("room"));
  if (!name) return { error: "Sala inválida." };
  // Confirmação por digitação do nome: evita apagar sala por clique acidental.
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== name) {
    return { error: "Digite o nome da sala exatamente para confirmar." };
  }
  const deleted = await db().delete(rooms).where(eq(rooms.name, name)).returning({ id: rooms.id });
  if (deleted.length === 0) return { error: "Sala não encontrada." };

  await audit({ action: "room.delete", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: name });
  await pushPolicy();
  redirect("/settings/rooms");
}

export async function syncNowAction(): Promise<void> {
  const admin = await requireFullAuth("admin");
  const s = await syncPolicy();
  await audit({ action: "policy.sync", actorId: admin.id, actorLabel: admin.username, details: { ok: s.ok } });
  redirect("/settings/rooms");
}

/** Liga/desliga o lobby de entrada da sala (quem decide é o painel; moderadores não mexem nisso). */
export async function setLobbyAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("admin");
  const name = roomNameOf(formData.get("room"));
  if (!name) redirect("/settings/rooms");
  const lobby = String(formData.get("lobby") ?? "") === "on";

  const changed = await db().update(rooms).set({ lobby, updatedAt: new Date() }).where(eq(rooms.name, name)).returning({ id: rooms.id });
  if (changed.length > 0) {
    await audit({ action: "room.lobby", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: name, details: { lobby } });
    await pushPolicy();
  }
  revalidatePath(`/settings/rooms/${name}`);
  redirect(`/settings/rooms/${name}`);
}

/** Liga/desliga a "Sala com senha": convidados entram com a senha vigente, sem esperar aprovação (não vale em sala exclusiva). */
export async function setPasswordAction(formData: FormData): Promise<void> {
  const admin = await requireFullAuth("admin");
  const name = roomNameOf(formData.get("room"));
  if (!name) redirect("/settings/rooms");
  const password = String(formData.get("password") ?? "") === "on";

  const changed = await db().update(rooms).set({ password, updatedAt: new Date() }).where(eq(rooms.name, name)).returning({ id: rooms.id });
  if (changed.length > 0) {
    await audit({ action: "room.password", actorId: admin.id, actorLabel: admin.username, targetType: "room", targetId: name, details: { senha: password } });
    await pushPolicy();
  }
  revalidatePath(`/settings/rooms/${name}`);
  redirect(`/settings/rooms/${name}`);
}
