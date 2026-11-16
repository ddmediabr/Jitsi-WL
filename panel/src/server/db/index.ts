import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/server/env";
import * as authSchema from "./auth-schema";
import * as appSchema from "./schema";

const schema = { ...appSchema, ...authSchema };

/** Pool único por processo (sobrevive a recarga em desenvolvimento). */
const globalForPool = globalThis as unknown as { __ddPool?: Pool };

function pool(): Pool {
  if (!globalForPool.__ddPool) {
    globalForPool.__ddPool = new Pool({
      connectionString: env().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      // Nenhuma consulta fica pendurada para sempre (DoS).
      statement_timeout: 10_000,
      application_name: "jitsi-panel",
    });
  }
  return globalForPool.__ddPool;
}

/** Pool bruto (para SQL que o Drizzle não cobre bem, como upserts atômicos). */
export function pgPool(): Pool {
  return pool();
}

export function db() {
  return drizzle(pool(), { schema });
}

/** Verificação de saúde do banco (usada por /flow-api/ready). */
export async function pingDb(): Promise<boolean> {
  try {
    await pool().query("select 1");
    return true;
  } catch {
    return false;
  }
}
