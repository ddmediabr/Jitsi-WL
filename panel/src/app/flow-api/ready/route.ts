import { pingDb } from "@/server/db";

// Prontidão (não usada pelo Coolify): confirma só que o banco responde. Sem detalhes na resposta.
export async function GET() {
  const ok = await pingDb();
  return Response.json({ ok }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
