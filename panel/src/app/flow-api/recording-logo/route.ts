import { getBrandAsset } from "@/server/brand/brand";

// Marca d'água das GRAVAÇÕES: o Jibri grava a página do Jitsi, não a nossa. O proxy do gravador aponta o logo dessa página para cá.
// Devolve o logo da marca (o do tema escuro, ou o claro) ou, sem logo, uma imagem transparente: nunca o logo do Jitsi.
export const dynamic = "force-dynamic";

const BLANK = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';

export async function GET() {
  const asset = (await getBrandAsset("logo_dark").catch(() => null)) ?? (await getBrandAsset("logo_light").catch(() => null));
  const headers = { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" };
  if (!asset) return new Response(BLANK, { status: 200, headers: { ...headers, "Content-Type": "image/svg+xml" } });
  return new Response(new Uint8Array(asset.data), { status: 200, headers: { ...headers, "Content-Type": asset.mime, "Content-Length": String(asset.data.length) } });
}
