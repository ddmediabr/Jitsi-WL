import "server-only";
import sharp, { type Sharp } from "sharp";
import { MAX_ENTRY_IMAGE_BYTES } from "@/lib/brand";
import { sniffImage } from "@/server/users/photo";

/**
 * Logo e favicon do painel. Mesma disciplina da foto de perfil: o tipo vem do CONTEÚDO (não da extensão nem do Content-Type),
 * a imagem é decodificada de verdade e REGRAVADA (nada do arquivo original é guardado, nem metadados), e há teto de pixels.
 * SVG fica de fora de propósito: pode carregar script.
 */
export const MAX_BRAND_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_PIXELS = 36_000_000;
export const LOGO_MAX = { width: 640, height: 160 };
export const FAVICON_SIZE = 64;
export const ENTRY_IMAGE_MAX = { width: 1920, height: 1080 };

export type ProcessedImage = { ok: true; data: Buffer; mime: string } | { ok: false; error: string };

async function decode(input: Buffer, minSide: number): Promise<{ ok: true; image: Sharp } | { ok: false; error: string }> {
  if (input.length === 0) return { ok: false, error: "Nenhum arquivo enviado." };
  if (input.length > MAX_BRAND_BYTES) return { ok: false, error: "A imagem deve ter no máximo 2 MB." };
  const kind = sniffImage(input);
  if (!kind) return { ok: false, error: "Formato não aceito. Use PNG, JPG, TIFF ou WebP." };
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false });
    const meta = await image.metadata();
    if (meta.format !== kind) return { ok: false, error: "O conteúdo do arquivo não bate com o formato. Envie outra imagem." };
    if (!meta.width || !meta.height || meta.width < minSide || meta.height < minSide) {
      return { ok: false, error: `A imagem é pequena demais (mínimo ${minSide} x ${minSide}).` };
    }
    return { ok: true, image };
  } catch {
    return { ok: false, error: "Não foi possível ler a imagem. Ela pode estar corrompida." };
  }
}

/** Logo: mantém a proporção e a transparência; cabe em 640 x 160 (sem ampliar); WebP, sem metadados. */
export async function processLogo(input: Buffer): Promise<ProcessedImage> {
  const d = await decode(input, 16);
  if (!d.ok) return d;
  try {
    const data = await d.image
      .rotate()
      .resize(LOGO_MAX.width, LOGO_MAX.height, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 92 })
      .toBuffer();
    return { ok: true, data, mime: "image/webp" };
  } catch {
    return { ok: false, error: "Não foi possível ler a imagem. Ela pode estar corrompida." };
  }
}

/** Favicon: quadrado de 64 x 64 (recorte central), PNG, sem metadados. */
export async function processFavicon(input: Buffer): Promise<ProcessedImage> {
  const d = await decode(input, 16);
  if (!d.ok) return d;
  try {
    const data = await d.image
      .rotate()
      .resize(FAVICON_SIZE, FAVICON_SIZE, { fit: "cover", position: "centre" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return { ok: true, data, mime: "image/png" };
  } catch {
    return { ok: false, error: "Não foi possível ler a imagem. Ela pode estar corrompida." };
  }
}

/** Imagem de fundo das páginas de entrada: até 3 MB, cabe em 1920 x 1080 (sem ampliar), WebP, sem metadados. */
export async function processEntryImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length > MAX_ENTRY_IMAGE_BYTES) return { ok: false, error: "A imagem deve ter no máximo 3 MB." };
  // decode() limita a 2 MB (logos): aqui o limite é maior, então a imagem é lida direto.
  const kind = sniffImage(input);
  if (!kind) return { ok: false, error: "Formato não aceito. Use PNG, JPG, TIFF ou WebP." };
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false });
    const meta = await image.metadata();
    if (meta.format !== kind) return { ok: false, error: "O conteúdo do arquivo não bate com o formato. Envie outra imagem." };
    if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) return { ok: false, error: "A imagem é pequena demais (mínimo 200 x 200)." };
    const data = await image
      .rotate()
      .resize(ENTRY_IMAGE_MAX.width, ENTRY_IMAGE_MAX.height, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
    return { ok: true, data, mime: "image/webp" };
  } catch {
    return { ok: false, error: "Não foi possível ler a imagem. Ela pode estar corrompida." };
  }
}
