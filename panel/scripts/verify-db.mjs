// Verificação de segurança do banco (Onda 0). Roda DENTRO do contêiner do painel:
//   node scripts/verify-db.mjs
// Usa DATABASE_URL (usuário de menor privilégio) e confirma o que ele NÃO pode fazer.
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "OK  " : "FALHA"} ${name}${extra ? " (" + extra + ")" : ""}`);

async function denied(sql) {
  try {
    await client.query(sql);
    return false;
  } catch (e) {
    return /permission denied|must be owner|row-level security|violates/i.test(String(e.message));
  }
}

await client.connect();
try {
  const who = (await client.query("select current_user as u")).rows[0].u;
  check("conecta como usuário de aplicativo", who === "panel_app", who);

  const flags = (await client.query("select rolsuper, rolcreatedb, rolcreaterole, rolreplication from pg_roles where rolname = current_user")).rows[0];
  check("sem superusuário/criar banco/criar papel/replicação", !flags.rolsuper && !flags.rolcreatedb && !flags.rolcreaterole && !flags.rolreplication);

  await client.query("insert into audit_log (action, details) values ('system.verify-db', '{}'::jsonb)");
  check("consegue ACRESCENTAR à auditoria", true);
  const read = await client.query("select count(*)::int as n from audit_log where action = 'system.verify-db'");
  check("consegue LER a auditoria", read.rows[0].n >= 1, `${read.rows[0].n} linhas`);

  check("NÃO consegue ALTERAR a auditoria", await denied("update audit_log set action = 'x' where action = 'system.verify-db'"));
  check("NÃO consegue APAGAR da auditoria", await denied("delete from audit_log where action = 'system.verify-db'"));
  check("NÃO consegue ESVAZIAR a auditoria", await denied("truncate audit_log"));
  check("NÃO consegue criar tabelas", await denied("create table intruso (id int)"));
  check("NÃO consegue apagar a tabela da auditoria", await denied("drop table audit_log"));
  check("NÃO consegue criar papéis", await denied("create role intruso login"));
} finally {
  await client.end();
}
console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FALHA")) ? 1 : 0);
