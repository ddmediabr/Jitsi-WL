import "server-only";
import { pgPool } from "@/server/db";

/**
 * Anti-força-bruta persistido no banco (RULES §10: "anti-brute-force measures").
 * Janela de 15 min; ao atingir o limite a chave fica bloqueada por 15 min.
 * As chaves são por IP e por NOME DE USUÁRIO (exista ou não: o comportamento é idêntico, para
 * não revelar quais usuários existem).
 */
export const LIMIT_PER_USER = 5;
export const LIMIT_PER_IP = 20;

export async function isLocked(keys: string[]): Promise<boolean> {
  const r = await pgPool().query(
    "select 1 from auth_throttle where key = any($1::text[]) and locked_until > now() limit 1",
    [keys],
  );
  return (r.rowCount ?? 0) > 0;
}

export async function registerFailure(key: string, limit: number): Promise<void> {
  await pgPool().query(
    `insert into auth_throttle as t (key, count, window_start) values ($1, 1, now())
     on conflict (key) do update set
       count = case when t.window_start < now() - interval '15 minutes' then 1 else t.count + 1 end,
       window_start = case when t.window_start < now() - interval '15 minutes' then now() else t.window_start end,
       locked_until = case
         when (case when t.window_start < now() - interval '15 minutes' then 1 else t.count + 1 end) >= $2
         then now() + interval '15 minutes' else t.locked_until end`,
    [key, limit],
  );
}

export async function clearFailures(keys: string[]): Promise<void> {
  await pgPool().query("delete from auth_throttle where key = any($1::text[])", [keys]);
}
