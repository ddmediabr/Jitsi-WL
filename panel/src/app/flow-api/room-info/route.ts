import { roomPublicInfo } from "@/server/rooms/public-info";

// Estado público mínimo da sala (existe? exclusiva? senha? expirada?). Veja server/rooms/public-info.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const room = new URL(request.url).searchParams.get("room") ?? "";
  const info = await roomPublicInfo(room);
  return Response.json({ ok: true, ...info }, { headers: { "Cache-Control": "no-store" } });
}
