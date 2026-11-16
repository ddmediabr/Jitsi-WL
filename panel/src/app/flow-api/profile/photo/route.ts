import { audit } from "@/server/auth/audit";
import { rateLimited, sameOrigin, userOfRequest } from "@/server/prosody/identity";
import { MAX_PHOTO_BYTES } from "@/server/users/photo";
import { changePhoto, getProfileView } from "@/server/users/profile-service";

// Upload da foto de perfil de quem está logado. O corpo é a imagem crua. Segurança:
//  - identidade pelo segredo HttpOnly (nunca pelo corpo) e mesma origem;
//  - tamanho conferido no cabeçalho E nos bytes recebidos (máx. 2 MB);
//  - o tipo vem do CONTEÚDO (assinatura), não do Content-Type nem da extensão; só JPG, PNG, TIFF e WebP;
//  - a imagem é decodificada e regravada (WebP 256x256, sem metadados), então nada do arquivo original é guardado;
//  - política de trocas (3 livres, 15 dias, 30 dias); a foto nova substitui a antiga.
export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return json(403, { ok: false, error: "origem inválida" });
  const user = await userOfRequest(request);
  if (!user) return json(401, { ok: false, error: "Sessão expirada. Entre de novo." });
  if (rateLimited(`photo:${user}`, 10, 10 * 60_000)) return json(429, { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_PHOTO_BYTES + 1024) return json(413, { ok: false, error: "A foto deve ter no máximo 2 MB." });

  // Lê no máximo 2 MB + 1 byte, sem confiar no cabeçalho.
  const reader = request.body?.getReader();
  if (!reader) return json(400, { ok: false, error: "Nenhum arquivo enviado." });
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_PHOTO_BYTES) {
      await reader.cancel();
      return json(413, { ok: false, error: "A foto deve ter no máximo 2 MB." });
    }
    chunks.push(value);
  }

  const r = await changePhoto(user, Buffer.concat(chunks), "self");
  if (!r.ok) return json(200, { ok: false, error: r.error, profile: await getProfileView(user) });
  await audit({ action: "user.photo", actorLabel: user, targetType: "user", targetId: user, details: { por: "usuario" } });
  return json(200, { ok: true, notice: r.notice, profile: await getProfileView(user) });
}
