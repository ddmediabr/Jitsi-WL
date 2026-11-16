// Mostra os últimos eventos da auditoria (somente leitura). Rodar dentro do contêiner do painel:
//   node scripts/audit-tail.mjs [quantidade]
import pg from "pg";

const limit = Math.min(Math.max(Number(process.argv[2]) || 15, 1), 200);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  // Fuso configurado no painel (Configurações > Ajustes); sem ele, o padrão do produto.
  const tz = (await client.query("select value #>> '{}' as tz from app_settings where key = 'timezone'")).rows[0]?.tz || "America/Sao_Paulo";
  const r = await client.query(
    "select to_char(at at time zone $2, 'DD/MM HH24:MI:SS') as quando, action, actor_label, ip from audit_log order by id desc limit $1",
    [limit, tz],
  );
  for (const row of r.rows) console.log(`${row.quando}  ${row.action}  ${row.actor_label ?? "-"}  ip=${row.ip ?? "-"}`);
} finally {
  await client.end();
}
