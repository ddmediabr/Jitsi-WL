import "server-only";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { env } from "@/server/env";

/**
 * Executada na inicialização do contêiner (instrumentation.ts), com o usuário DONO do banco.
 * 1) aplica as migrações; 2) garante o usuário de menor privilégio `panel_app` e seus direitos.
 * Idempotente. Se falhar, o servidor não sobe (o Coolify mantém a versão anterior).
 */
export async function runMigrations(): Promise<void> {
  const { DATABASE_ADMIN_URL, APP_DB_PASSWORD } = env();
  if (!DATABASE_ADMIN_URL || !APP_DB_PASSWORD) {
    throw new Error("DATABASE_ADMIN_URL e APP_DB_PASSWORD são obrigatórias para migrar.");
  }

  const client = new Client({ connectionString: DATABASE_ADMIN_URL, application_name: "jitsi-panel-migrate" });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });

    // Usuário de runtime: sem superusuário, sem criar banco/papéis, sem DDL.
    const pw = client.escapeLiteral(APP_DB_PASSWORD);
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'panel_app') THEN
          CREATE ROLE panel_app LOGIN;
        END IF;
      END $$;
    `);
    await client.query(
      `ALTER ROLE panel_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${pw}`,
    );
    const dbName = (await client.query("select current_database() as n")).rows[0].n as string;
    await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(dbName)} TO panel_app`);
    await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
    await client.query(`GRANT USAGE ON SCHEMA public TO panel_app`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO panel_app`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO panel_app`);

    // audit_log: só acrescenta. Privilégios E política de linha (defesa em profundidade).
    await client.query(`REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM panel_app`);
    await client.query(`ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY`);
    await client.query(`DROP POLICY IF EXISTS audit_log_select ON audit_log`);
    await client.query(`DROP POLICY IF EXISTS audit_log_insert ON audit_log`);
    await client.query(`CREATE POLICY audit_log_select ON audit_log FOR SELECT TO panel_app USING (true)`);
    await client.query(`CREATE POLICY audit_log_insert ON audit_log FOR INSERT TO panel_app WITH CHECK (true)`);

    // Retenção: a ÚNICA forma de o painel apagar registros antigos. A função roda com os direitos do dono do banco (o painel não
    // tem DELETE na tabela), só apaga o que tem 12 meses ou mais (o piso é checado aqui, não no aplicativo) e deixa um registro do
    // que apagou. Não há como apagar registros recentes por ela.
    await client.query(`
      CREATE OR REPLACE FUNCTION audit_purge(months integer) RETURNS integer
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
      DECLARE removed integer;
      BEGIN
        IF months IS NULL OR months < 12 THEN
          RAISE EXCEPTION 'retencao minima de 12 meses';
        END IF;
        DELETE FROM audit_log WHERE at < now() - make_interval(months => months);
        GET DIAGNOSTICS removed = ROW_COUNT;
        IF removed > 0 THEN
          INSERT INTO audit_log (action, details) VALUES ('system.audit.purge', jsonb_build_object('removidos', removed, 'meses', months));
        END IF;
        RETURN removed;
      END
      $fn$
    `);
    await client.query(`REVOKE ALL ON FUNCTION audit_purge(integer) FROM PUBLIC`);
    await client.query(`GRANT EXECUTE ON FUNCTION audit_purge(integer) TO panel_app`);
  } finally {
    await client.end();
  }
}
