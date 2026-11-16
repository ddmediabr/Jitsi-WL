import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { evaluate, noticeAfterChange, statusText, type ChangeState } from "@/lib/change-policy";
import { db } from "@/server/db";
import { jitsiPhotos, jitsiProfiles } from "@/server/db/schema";
import { pushPolicyNotice } from "@/server/prosody/sync";
import { getTimeZone } from "@/server/timezone";
import { processPhoto } from "./photo";
import { validateDisplayName } from "./profiles";

/** Quem está pedindo a troca: o próprio usuário (sujeito à política de trocas) ou o painel (sem limite). */
export type Actor = "self" | "admin";

export type ProfileView = {
  username: string;
  name: string;
  hasPhoto: boolean;
  photoVersion: number;
  photoUrl: string | null;
  /** Situação da política de trocas (um contador só para nome e foto). */
  status: string;
  allowed: boolean;
  /** Modo invisível liberado para a conta (só vale nas salas em que ela é moderadora). */
  invisibleAllowed: boolean;
  /** E-mail opcional (recebe o link das gravações que a conta iniciou). */
  email: string | null;
};

/** Contador único: nome e foto somam juntos; o prazo conta a partir da troca mais recente de qualquer um dos dois. */
function shared(r: { nameChanges: number; photoChanges: number; nameChangedAt: Date | null; photoChangedAt: Date | null }): ChangeState {
  const times = [r.nameChangedAt, r.photoChangedAt].filter((d): d is Date => d !== null).map((d) => d.getTime());
  return { count: r.nameChanges + r.photoChanges, lastAt: times.length ? new Date(Math.max(...times)) : null };
}

export type ChangeResult = { ok: true; notice: string } | { ok: false; error: string };

export const avatarUrl = (username: string, version: number) => `/flow-api/avatar/${encodeURIComponent(username)}?v=${version}`;

async function row(username: string) {
  return (await db().select().from(jitsiProfiles).where(eq(jitsiProfiles.username, username)).limit(1))[0] ?? null;
}

/** Garante a linha da conta (contas antigas ainda não têm nome: o nome inicial é o próprio usuário). */
async function ensure(username: string) {
  await db().insert(jitsiProfiles).values({ username, displayName: username }).onConflictDoNothing();
  return (await row(username))!;
}

export async function getProfileView(username: string, now = new Date()): Promise<ProfileView> {
  const r = await ensure(username);
  const state = shared(r);
  return {
    username,
    name: r.displayName,
    hasPhoto: r.photoVersion > 0,
    photoVersion: r.photoVersion,
    photoUrl: r.photoVersion > 0 ? avatarUrl(username, r.photoVersion) : null,
    status: statusText(state, now, await getTimeZone()),
    allowed: evaluate(state, now).allowed,
    invisibleAllowed: r.invisibleAllowed,
    email: r.email,
  };
}

/** O nome já é de outra conta? (sem diferenciar maiúsculas/minúsculas; também não vale o usuário de outra conta) */
export async function nameTaken(name: string, username: string): Promise<boolean> {
  const dup = await db()
    .select({ u: jitsiProfiles.username })
    .from(jitsiProfiles)
    .where(and(ne(jitsiProfiles.username, username), sql`lower(${jitsiProfiles.displayName}) = lower(${name})`))
    .limit(1);
  if (dup.length > 0) return true;
  const asUser = await db().select({ u: jitsiProfiles.username }).from(jitsiProfiles).where(and(ne(jitsiProfiles.username, username), sql`lower(${jitsiProfiles.username}) = lower(${name})`)).limit(1);
  return asUser.length > 0;
}

export async function changeName(username: string, raw: string, by: Actor, now = new Date()): Promise<ChangeResult> {
  const v = validateDisplayName(raw);
  if (!v.ok) return { ok: false, error: v.error };
  const current = await ensure(username);
  if (current.displayName === v.name) return { ok: false, error: "Esse já é o seu nome." };
  if (await nameTaken(v.name, username)) return { ok: false, error: "Já existe uma conta com esse nome. Escolha outro." };

  if (by === "admin") {
    await db().update(jitsiProfiles).set({ displayName: v.name, updatedAt: now }).where(eq(jitsiProfiles.username, username));
    await pushPolicyNotice();
    return { ok: true, notice: "Nome atualizado." };
  }
  // Troca do próprio usuário: confere a política e grava a contagem na MESMA operação (sem corrida entre duas trocas).
  const updated = await db().transaction(async (tx): Promise<{ blocked: string } | { count: number }> => {
    const [cur] = await tx.select().from(jitsiProfiles).where(eq(jitsiProfiles.username, username)).for("update");
    const state = shared(cur);
    if (!evaluate(state, now).allowed) return { blocked: statusText(state, now, await getTimeZone()) };
    await tx.update(jitsiProfiles).set({ displayName: v.name, nameChanges: cur.nameChanges + 1, nameChangedAt: now, updatedAt: now }).where(eq(jitsiProfiles.username, username));
    return { count: state.count + 1 };
  });
  if ("blocked" in updated) return { ok: false, error: updated.blocked };
  await pushPolicyNotice();
  return { ok: true, notice: noticeAfterChange("nome", updated.count, now, await getTimeZone()) };
}

export async function changePhoto(username: string, bytes: Buffer, by: Actor, now = new Date()): Promise<ChangeResult> {
  // A política vale ANTES de gastar processamento com a imagem.
  const current = await ensure(username);
  if (by === "self") {
    const state = shared(current);
    if (!evaluate(state, now).allowed) return { ok: false, error: statusText(state, now, await getTimeZone()) };
  }
  const processed = await processPhoto(bytes);
  if (!processed.ok) return { ok: false, error: processed.error };

  const result = await db().transaction(async (tx): Promise<{ blocked: string } | { count: number }> => {
    const [cur] = await tx.select().from(jitsiProfiles).where(eq(jitsiProfiles.username, username)).for("update");
    if (by === "self") {
      const state = shared(cur);
      if (!evaluate(state, now).allowed) return { blocked: statusText(state, now, await getTimeZone()) };
    }
    // Uma linha só por conta: a foto nova substitui a antiga (a antiga deixa de existir).
    await tx
      .insert(jitsiPhotos)
      .values({ username, data: processed.data, mime: "image/webp", updatedAt: now })
      .onConflictDoUpdate({ target: jitsiPhotos.username, set: { data: processed.data, mime: "image/webp", updatedAt: now } });
    const total = shared(cur).count;
    await tx
      .update(jitsiProfiles)
      .set({
        photoVersion: cur.photoVersion + 1,
        ...(by === "self" ? { photoChanges: cur.photoChanges + 1, photoChangedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(jitsiProfiles.username, username));
    return { count: by === "self" ? total + 1 : total };
  });
  if ("blocked" in result) return { ok: false, error: result.blocked };
  await pushPolicyNotice();
  return { ok: true, notice: by === "self" ? noticeAfterChange("foto", result.count, now, await getTimeZone()) : "Foto atualizada." };
}

/** Remove a foto da conta (só o painel faz isso). */
export async function removePhoto(username: string): Promise<void> {
  await db().delete(jitsiPhotos).where(eq(jitsiPhotos.username, username));
  await db().update(jitsiProfiles).set({ photoVersion: 0, updatedAt: new Date() }).where(eq(jitsiProfiles.username, username));
  await pushPolicyNotice();
}

export async function getPhoto(username: string): Promise<{ data: Buffer; mime: string; version: number } | null> {
  const [p] = await db().select().from(jitsiPhotos).where(eq(jitsiPhotos.username, username)).limit(1);
  const r = await row(username);
  if (!p || !r || r.photoVersion === 0) return null;
  return { data: p.data, mime: p.mime, version: r.photoVersion };
}

/** Apaga nome e foto da conta (usado quando a conta é apagada). */
export async function deleteProfile(username: string): Promise<void> {
  await db().delete(jitsiPhotos).where(eq(jitsiPhotos.username, username));
  await db().delete(jitsiProfiles).where(eq(jitsiProfiles.username, username));
}
