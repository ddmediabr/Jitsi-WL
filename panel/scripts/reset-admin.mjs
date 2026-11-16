// FERRAMENTA DE EMERGÊNCIA (break-glass): apaga TODOS os administradores, sessões, 2FA e bloqueios
// do painel, para que /settings/setup volte a existir. Só roda dentro do contêiner do painel
// (acesso ao servidor/Coolify) e exige confirmação explícita:
//
//   sh -c "CONFIRM_RESET=yes node scripts/reset-admin.mjs"
//
// A trilha de auditoria NÃO é apagada: o reset é registrado nela.
import pg from "pg";

if (process.env.CONFIRM_RESET !== "yes") {
  console.error("Recusado: defina CONFIRM_RESET=yes para confirmar.");
  process.exit(2);
}
if (!process.env.DATABASE_ADMIN_URL) {
  console.error("DATABASE_ADMIN_URL ausente.");
  process.exit(2);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await client.connect();
try {
  await client.query("begin");
  const before = (await client.query('select count(*)::int as n from "user"')).rows[0].n;
  await client.query('truncate "user", auth_throttle cascade');
  await client.query(
    "insert into audit_log (action, details) values ('system.admin-reset', $1::jsonb)",
    [JSON.stringify({ administradoresRemovidos: before })],
  );
  await client.query("commit");
  console.log(`OK: ${before} administrador(es) removido(s); /settings/setup disponível de novo.`);
} catch (e) {
  await client.query("rollback").catch(() => undefined);
  console.error("Falhou:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
