import "server-only";
import { createHash } from "node:crypto";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { jitsiProfiles, roomAccess, rooms } from "@/server/db/schema";
import { getSetting } from "@/server/settings";

/* Regras de nome (espelham o esquema estrito do Prosody em mod_ddmedia_admin_api). */
export const ROOM_NAME = /^[a-z0-9][a-z0-9_-]{1,63}$/;
export const MODERATOR_NAME = /^[a-z0-9._-]{1,64}$/;
export const MAX_ROOMS = 500;
export const MAX_MODERATORS = 50;
export const MAX_MEMBERS = 500;
export const ACCESS_ROLES = ["moderator", "member"] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];

/** Nomes que colidiriam com rotas do painel, do Jitsi ou da infraestrutura. */
export const RESERVED_ROOM_NAMES = new Set([
  "settings", "flow-api", "static", "libs", "css", "images", "sounds", "lang", "fonts", "plugins",
  "http-bind", "xmpp-websocket", "colibri-ws", "config", "external_api", "interface_config",
  "logging_config", "index", "api", "admin", "login", "logout", "health", "favicon", "robots",
  "sitemap", "_next", "_flow", "connection_optimization", "well-known",
]);

/** Papel vindo de formulário; qualquer coisa fora da lista vira o de menos privilégio. */
export function roleOf(raw: FormDataEntryValue | null): AccessRole {
  const v = String(raw ?? "");
  return (ACCESS_ROLES as readonly string[]).includes(v) ? (v as AccessRole) : "member";
}

export function validateRoomName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim().toLowerCase();
  if (!ROOM_NAME.test(name)) {
    return { ok: false, error: "Use de 2 a 64 caracteres: letras minúsculas, números, hífen ou sublinhado (começando por letra ou número)." };
  }
  if (RESERVED_ROOM_NAMES.has(name)) return { ok: false, error: "Esse nome é reservado pelo sistema." };
  return { ok: true, name };
}

const policySchema = z
  .object({
    version: z.literal(3),
    settings: z.object({
      reconnect_pass_seconds: z.number().int().min(10).max(86_400),
      remember_seconds: z.number().int().min(300).max(604_800),
    }),
    /** Nome e foto de cada conta: o Prosody impõe esses valores na presença de quem está na sala (ninguém troca por comando direto). */
    profiles: z.record(z.string().regex(MODERATOR_NAME), z.object({ name: z.string().min(1).max(60), photo: z.number().int().positive().optional(), invisible: z.boolean().optional() })),
    rooms: z.record(
      z.string().regex(ROOM_NAME),
      z.object({
        kind: z.enum(["permanent", "temporary"]),
        /** Só salas temporárias: instante (segundos Unix) em que a sala deixa de abrir reuniões novas. */
        expires_at: z.number().int().positive().max(4_102_444_800).optional(),
        moderators: z.array(z.string().regex(MODERATOR_NAME)).max(MAX_MODERATORS),
        members: z.array(z.string().regex(MODERATOR_NAME)).max(MAX_MEMBERS),
        starters: z.array(z.string().regex(MODERATOR_NAME)).max(MAX_MEMBERS),
        exclusive: z.boolean(),
        lobby: z.boolean(),
        password: z.boolean(),
      }),
    ),
  })
  .strict();

export type Policy = z.infer<typeof policySchema>;

/** Gera a política completa a partir do banco (ordem estável) e valida antes de qualquer envio. */
export async function buildPolicy(): Promise<{ policy: Policy; body: string; hash: string }> {
  const roomRows = await db().select().from(rooms).orderBy(asc(rooms.name));
  const modRows = await db().select().from(roomAccess).orderBy(asc(roomAccess.username));

  const mods = new Map<string, string[]>();
  const members = new Map<string, string[]>();
  const starters = new Map<string, string[]>();
  for (const m of modRows) {
    const target = m.role === "moderator" ? mods : members; // qualquer outro valor vira "usuário comum" (menos privilégio)
    const list = target.get(m.roomId) ?? [];
    list.push(m.username);
    target.set(m.roomId, list);
    if (m.role !== "moderator" && m.canStart) starters.set(m.roomId, [...(starters.get(m.roomId) ?? []), m.username]);
  }
  const profileRows = await db().select({ u: jitsiProfiles.username, n: jitsiProfiles.displayName, v: jitsiProfiles.photoVersion, i: jitsiProfiles.invisibleAllowed }).from(jitsiProfiles).orderBy(asc(jitsiProfiles.username));
  const policy: Policy = {
    version: 3,
    profiles: Object.fromEntries(profileRows.map((p) => [p.u, { name: p.n, ...(p.v > 0 ? { photo: p.v } : {}), ...(p.i ? { invisible: true } : {}) }])),
    settings: {
      reconnect_pass_seconds: await getSetting("reconnect_pass_seconds"),
      remember_seconds: await getSetting("remember_seconds"),
    },
    rooms: Object.fromEntries(
      roomRows.map((r) => [
        r.name,
        { kind: r.kind === "temporary" ? ("temporary" as const) : ("permanent" as const), ...(r.kind === "temporary" && r.expiresAt ? { expires_at: Math.floor(r.expiresAt.getTime() / 1000) } : {}), moderators: mods.get(r.id) ?? [], members: members.get(r.id) ?? [], starters: starters.get(r.id) ?? [], exclusive: r.exclusive, lobby: r.lobby, password: r.password && !r.exclusive },
      ]),
    ),
  };
  const parsed = policySchema.parse(policy); // lança se o painel tentar gerar algo inválido
  const body = JSON.stringify(parsed);
  return { policy: parsed, body, hash: createHash("sha256").update(body).digest("hex") };
}
