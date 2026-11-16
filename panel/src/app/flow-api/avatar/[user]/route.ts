import { MODERATOR_NAME } from "@/server/policy";
import { getPhoto } from "@/server/users/profile-service";

// Foto de perfil (WebP já reprocessado). Pública, como qualquer avatar de reunião; a versão na URL (?v=) muda a cada foto nova.
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  if (!MODERATOR_NAME.test(user)) return new Response(null, { status: 404 });
  const photo = await getPhoto(user);
  if (!photo) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const v = new URL(request.url).searchParams.get("v");
  const versioned = v === String(photo.version);
  return new Response(new Uint8Array(photo.data), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(photo.data.length),
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
