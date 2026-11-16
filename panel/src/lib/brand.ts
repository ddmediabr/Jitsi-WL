import { DEFAULT_ENTRY_BG, type EntryBg } from "@/lib/entry-bg";
import { EXIT_DEFAULTS, type ExitTexts } from "@/lib/exit-texts";

/** Identidade visual (white label): módulo puro, usado no servidor e no navegador. */
export type Brand = {
  name: string;
  /** Logo de cada tema (um para o escuro, outro para o claro). Qualquer um que exista substitui o nome. */
  logoDarkVersion: number | null;
  logoLightVersion: number | null;
  faviconVersion: number | null;
  /** Proporção (largura / altura) de cada logo; null quando não há logo. Quadrado ≈ 1. */
  logoDarkRatio: number | null;
  logoLightRatio: number | null;
  /** Fundo das páginas de entrada (modo e filtros) e a versão do vídeo / da imagem enviados. */
  entryBg: EntryBg;
  entryVideoVersion: number | null;
  entryImageVersion: number | null;
  /** Textos da página de saída da reunião. */
  exit: ExitTexts;
  /** Quadros por segundo do compartilhamento de tela (configuração do painel). */
  shareFps: number;
};

export const EMPTY_ENTRY = { entryBg: DEFAULT_ENTRY_BG, entryVideoVersion: null, entryImageVersion: null, exit: EXIT_DEFAULTS, shareFps: 15 } as const;

/** Logo "quadrado": proporção perto de 1. Qualquer outro (retangular) é tratado como logo largo ou alto. */
export const isSquareLogo = (ratio: number | null) => ratio !== null && ratio >= 0.85 && ratio <= 1.18;

export const MAX_BRAND_NAME = 40;

/** Endereço (público) do logo/favicon; a versão faz o navegador buscar de novo quando a imagem muda. */
export type BrandAssetKind = "logo_dark" | "logo_light" | "favicon" | "entry_video" | "entry_image";
export const brandUrl = (kind: BrandAssetKind, version: number) => `/flow-api/brand/${kind}?v=${version}`;

export function validateBrandName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < 1 || name.length > MAX_BRAND_NAME) return { ok: false, error: `O nome deve ter de 1 a ${MAX_BRAND_NAME} caracteres.` };
  if (/\p{C}/u.test(name)) return { ok: false, error: "O nome não pode ter caracteres de controle." };
  return { ok: true, name };
}

/** Tamanho máximo de uma imagem enviada pelo painel. Conferido ANTES de enviar: o Next recusa corpos grandes com uma página de erro genérica. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
/** Fundo das páginas de entrada: o vídeo enviado pode ter até 10 MB (o painel converte para 8 s e 3 MB); a imagem, até 3 MB. */
export const MAX_ENTRY_VIDEO_BYTES = 10 * 1024 * 1024;
export const MAX_ENTRY_IMAGE_BYTES = 3 * 1024 * 1024;
export const TOO_BIG_MESSAGE = "A imagem deve ter no máximo 2 MB.";
