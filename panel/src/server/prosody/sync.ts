import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { appSettings } from "@/server/db/schema";
import { buildPolicy, MODERATOR_NAME } from "@/server/policy";
import { prosodyCall, prosodyConfigured } from "./client";

/**
 * Envia a política ao Prosody pela API interna (mod_ddmedia_admin_api).
 * Cada pedido é assinado: HMAC-SHA256(segredo, "<timestamp>.<nonce>.<corpo>").
 * Variáveis (só no Coolify): PROSODY_ADMIN_URL (ex.: http://<contêiner>:5280/ddmedia-admin),
 * PROSODY_ADMIN_SECRET (mesmo conteúdo do arquivo ddmedia-admin.secret do Prosody) e,
 * opcionalmente, PROSODY_ADMIN_HOST (cabeçalho Host; padrão meet.jitsi).
 */
export type SyncStatus = { at: string; ok: boolean; error?: string; hash?: string; rooms?: number; skipped?: boolean };

const STATUS_KEY = "policy_sync";

async function record(status: SyncStatus): Promise<void> {
  try {
    await db()
      .insert(appSettings)
      .values({ key: STATUS_KEY, value: status })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: status, updatedAt: new Date() } });
  } catch (e) {
    console.error("[prosody] não foi possível registrar o estado da sincronização", e instanceof Error ? e.message : e);
  }
}

export async function readSyncStatus(): Promise<SyncStatus | null> {
  const rows = await db().select().from(appSettings).where(eq(appSettings.key, STATUS_KEY)).limit(1);
  const v = rows[0]?.value as Partial<SyncStatus> | undefined;
  return v && typeof v.at === "string" && typeof v.ok === "boolean" ? (v as SyncStatus) : null;
}


/**
 * Nomes das contas Jitsi existentes (só nomes), para sugerir na hora de cadastrar moderadores.
 * Devolve `null` se o servidor não respondeu (a tela cai para digitação manual).
 */
export async function listJitsiUsers(): Promise<string[] | null> {
  try {
    const res = await prosodyCall("GET", "/users");
    if (res.status !== 200 || res.json.ok !== true || !Array.isArray(res.json.users)) return null;
    return res.json.users.filter((u): u is string => typeof u === "string" && MODERATOR_NAME.test(u));
  } catch {
    return null;
  }
}

export async function syncPolicy(): Promise<SyncStatus> {
  const now = () => new Date().toISOString();

  if (!prosodyConfigured()) {
    const s: SyncStatus = { at: now(), ok: false, skipped: true, error: "Sincronização não configurada neste ambiente." };
    await record(s);
    return s;
  }

  try {
    const { body, hash, policy } = await buildPolicy();
    const res = await prosodyCall("POST", "/policy", body);
    const payload = res.json as { ok?: boolean; hash?: string; error?: string };
    if (res.status < 200 || res.status >= 300 || payload.ok !== true) {
      const s: SyncStatus = { at: now(), ok: false, error: `O servidor recusou a política (${res.status}${payload.error ? ": " + payload.error : ""}).` };
      await record(s);
      return s;
    }
    // O Prosody devolve o hash do que aplicou: tem de ser igual ao que enviamos.
    if (payload.hash && payload.hash !== hash) {
      const s: SyncStatus = { at: now(), ok: false, error: "O servidor aplicou uma política diferente da enviada." };
      await record(s);
      return s;
    }
    const s: SyncStatus = { at: now(), ok: true, hash, rooms: Object.keys(policy.rooms).length };
    await record(s);
    return s;
  } catch (e) {
    const reason = e instanceof Error ? e.name : "erro";
    const s: SyncStatus = { at: now(), ok: false, error: `Falha ao falar com o servidor de reuniões (${reason}).` };
    await record(s);
    return s;
  }
}

/** Depois de mudar o banco: reenvia a política. Devolve um aviso (texto) se o servidor não a recebeu. */
export async function pushPolicyNotice(): Promise<string | undefined> {
  const s = await syncPolicy();
  return s.ok || s.skipped
    ? undefined
    : "Salvo no painel, mas o servidor de reuniões ainda não recebeu a mudança. Ele tenta de novo sozinho em 1 minuto.";
}
