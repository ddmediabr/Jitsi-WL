import "server-only";
import sharp from "sharp";

/** Foto de perfil: tipos aceitos, tamanho máximo do arquivo e tamanho da imagem guardada. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_SIZE = 256;
/** Teto de pixels da imagem de entrada (bomba de descompressão: 2 MB de arquivo podem virar centenas de milhões de pixels). */
const MAX_INPUT_PIXELS = 36_000_000;

type Kind = "jpeg" | "png" | "tiff" | "webp";

/** Descobre o tipo PELO CONTEÚDO (assinatura no início do arquivo). Extensão e Content-Type informado pelo cliente não valem. */
export function sniffImage(b: Buffer): Kind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 4 && (b.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || b.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])))) return "tiff";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

export type PhotoResult = { ok: true; data: Buffer } | { ok: false; error: string };

/**
 * Valida e reprocessa a foto: confere tamanho, tipo pelo conteúdo, e DECODIFICA a imagem de verdade; depois recorta
 * em quadrado e grava de novo como WebP 256x256, sem nenhum metadado (EXIF/GPS) nem dado escondido. O arquivo original nunca é guardado.
 */
export async function processPhoto(input: Buffer): Promise<PhotoResult> {
  if (input.length === 0) return { ok: false, error: "Nenhum arquivo enviado." };
  if (input.length > MAX_PHOTO_BYTES) return { ok: false, error: "A foto deve ter no máximo 2 MB." };
  const kind = sniffImage(input);
  if (!kind) return { ok: false, error: "Formato não aceito. Use JPG, PNG, TIFF ou WebP." };
  try {
    const base = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false });
    const meta = await base.metadata();
    const detected = meta.format === "jpeg" ? "jpeg" : meta.format;
    if (detected !== kind) return { ok: false, error: "O conteúdo do arquivo não bate com o formato. Envie outra imagem." };
    if (!meta.width || !meta.height || meta.width < 32 || meta.height < 32) return { ok: false, error: "A imagem é pequena demais (mínimo 32 x 32)." };
    const data = await base
      .rotate() // aplica a orientação do EXIF antes de descartá-lo
      .resize(PHOTO_SIZE, PHOTO_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 85 })
      .toBuffer();
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Não foi possível ler a imagem. Ela pode estar corrompida." };
  }
}
