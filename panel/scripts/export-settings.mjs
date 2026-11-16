// Mostra as configurações do painel (tabela app_settings) e os tipos/tamanhos das imagens da marca. SOMENTE LEITURA.
// Serve para conferir o visual de uma instalação e para copiar o design para outra. Rodar dentro do contêiner do painel:
//   node scripts/export-settings.mjs
// Não imprime o conteúdo das imagens (só tipo, tamanho e versão). A tabela app_settings não guarda segredos.
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const settings = (await client.query("select key, value from app_settings order by key")).rows;
  console.log("SETTINGS " + JSON.stringify(Object.fromEntries(settings.map((r) => [r.key, r.value]))));
  const assets = (await client.query("select kind, mime, octet_length(data) as bytes, version from brand_assets order by kind")).rows;
  console.log("ASSETS " + JSON.stringify(assets));
} finally {
  await client.end();
}
