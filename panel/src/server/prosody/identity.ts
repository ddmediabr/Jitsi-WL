import "server-only";
import { MODERATOR_NAME } from "@/server/policy";
import { prosodyCall } from "./client";

/** Segredo do navegador (cookie HttpOnly __Host-ddpass): só o servidor lê. */
export function tokenOf(request: Request): string | null {
  return /(?:^|;\s*)__Host-ddpass=([0-9a-f]{32,128})/.exec(request.headers.get("cookie") ?? "")?.[1] ?? null;
}

/**
 * Quem é este navegador? Pergunta ao servidor de reuniões (que guarda a ligação segredo -> conta, feita no login com
 * senha). Devolve o usuário ou null (sem segredo, segredo desconhecido/vencido, servidor fora do ar).
 */
export async function userOfRequest(request: Request): Promise<string | null> {
  const token = tokenOf(request);
  if (!token) return null;
  try {
    const r = await prosodyCall("POST", "/session/whoami", { token });
    const user = r.status === 200 ? r.json.user : null;
    return typeof user === "string" && MODERATOR_NAME.test(user) ? user : null;
  } catch {
    return null;
  }
}

/** Pedido vindo da própria página (mesma origem)? Bloqueia chamadas de outros sites. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Limite simples por chave (em memória): no máximo `max` pedidos por `windowMs`. */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return list.length > max;
}

/** Só ESPIA o limite (sem contar este pedido): para limites que contam apenas as tentativas que falham. */
export function rateBlocked(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  return (hits.get(key) ?? []).filter((t) => now - t < windowMs).length >= max;
}

/** Registra uma tentativa que falhou. */
export function rateRecord(key: string): void {
  const list = hits.get(key) ?? [];
  list.push(Date.now());
  hits.set(key, list);
}
