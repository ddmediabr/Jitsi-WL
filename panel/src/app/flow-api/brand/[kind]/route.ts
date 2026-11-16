import { getBrandAsset, isBrandKind } from "@/server/brand/brand";

// Logo e favicon do painel (já reprocessados). Públicos, como qualquer logo de site: aparecem na tela de login e nas entradas das salas.
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!isBrandKind(kind)) return new Response(null, { status: 404 });
  const asset = await getBrandAsset(kind);
  if (!asset) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  const versioned = new URL(request.url).searchParams.get("v") === String(asset.version);
  const base = {
    "Content-Type": asset.mime,
    "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=60",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Accept-Ranges": "bytes",
  };
  // Vídeo: os navegadores (o Safari, principalmente) pedem pedaços do arquivo (Range) em vez do arquivo inteiro.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] !== "" || range[2] !== "")) {
    const size = asset.data.length;
    let start = range[1] === "" ? size - Number(range[2]) : Number(range[1]);
    let end = range[1] === "" || range[2] === "" ? size - 1 : Number(range[2]);
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
    const part = asset.data.subarray(start, end + 1);
    return new Response(new Uint8Array(part), { status: 206, headers: { ...base, "Content-Length": String(part.length), "Content-Range": `bytes ${start}-${end}/${size}` } });
  }
  return new Response(new Uint8Array(asset.data), { status: 200, headers: { ...base, "Content-Length": String(asset.data.length) } });
}
