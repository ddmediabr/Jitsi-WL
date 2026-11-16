import { audit } from "@/server/auth/audit";
import { rateLimited, sameOrigin, userOfRequest } from "@/server/prosody/identity";
import { changeName, getProfileView } from "@/server/users/profile-service";

// Perfil (nome de exibição) de quem está logado. A identidade vem do segredo HttpOnly do navegador, conferido no servidor de
// reuniões: o corpo do pedido NUNCA diz de quem é o perfil. A política de trocas (3 livres, 15 dias, 30 dias) vale aqui.
export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Perfil atual (nome, foto e situação das trocas). Sem login válido: { ok: false }. */
export async function GET(request: Request) {
  const user = await userOfRequest(request);
  if (!user) return json(200, { ok: false });
  return json(200, { ok: true, ...(await getProfileView(user)) });
}

/** Troca o nome. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { ok: false, error: "origem inválida" });
  const user = await userOfRequest(request);
  if (!user) return json(401, { ok: false, error: "Sessão expirada. Entre de novo." });
  if (rateLimited(`profile:${user}`, 20, 10 * 60_000)) return json(429, { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." });

  let data: { name?: unknown };
  try {
    data = JSON.parse((await request.text()).slice(0, 2048));
  } catch {
    return json(400, { ok: false, error: "pedido inválido" });
  }
  if (typeof data.name !== "string") return json(400, { ok: false, error: "pedido inválido" });

  const r = await changeName(user, data.name, "self");
  if (!r.ok) return json(200, { ok: false, error: r.error, profile: await getProfileView(user) });
  await audit({ action: "user.rename", actorLabel: user, targetType: "user", targetId: user, details: { por: "usuario" } });
  return json(200, { ok: true, notice: r.notice, profile: await getProfileView(user) });
}
