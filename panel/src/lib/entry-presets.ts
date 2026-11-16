import { cleanFilter, DEFAULT_FILTERS, type BgFilter, type EntryBg, type Theme } from "@/lib/entry-bg";
import { findImagePreset, findVideoPreset } from "@/lib/entry-preset-list";
import { PALETTES, paletteTokens, type PaletteId } from "@/lib/palette";

/**
 * Ajuste de filtros de cada preset para cada paleta. O vídeo/imagem original tem uma cor (matiz); o filtro gira essa cor até a cor de
 * destaque da paleta. No escuro, a mídia (luz sobre preto) é somada ao fundo (`screen`). No claro, ela é invertida e volta ao matiz
 * original (`invert` + `hue-rotate(180°)`), então vira traço colorido sobre o claro (`multiply`). Paletas neutras tiram a cor.
 */
export type MediaKind = "video" | "image";

const hueOf = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

/** Ajustes finos por mídia (o resultado de olhar cada combinação): somados ao cálculo base. */
type Tune = Partial<Pick<BgFilter, "opacity" | "brightness" | "contrast" | "saturate">> & { /** Soma ao matiz calculado (graus). */ hueAdj?: number };
type MediaTune = { dark: Tune; light: Tune; byPalette?: Partial<Record<PaletteId, { dark?: Tune; light?: Tune }>> };

const TUNE: Record<string, MediaTune> = {
  // Imagens: o degradê tem várias cores, então perde saturação para acompanhar a paleta; a névoa (azul-marinho e bege) ganha.
  degrade: { dark: { saturate: 75 }, light: { saturate: 65 } },
  nevoa: { dark: { saturate: 175 }, light: { saturate: 165 } },
  seda: { dark: {}, light: {} },
  particulas: {
    dark: { brightness: 120, contrast: 115 },
    light: { opacity: 100, brightness: 94, contrast: 135, saturate: 80 },
    byPalette: {
      // Azul (padrão): valores escolhidos à mão no painel e adotados como padrão.
      azul: {
        dark: { opacity: 90, brightness: 100, contrast: 100, saturate: 120, hueAdj: 1 },
        light: { opacity: 90, brightness: 100, contrast: 120, saturate: 150, hueAdj: -4 },
      },
      verde: { light: { hueAdj: -45 } },
      vermelho: { light: { hueAdj: -10 } },
      amarelo: { light: { hueAdj: 0 } },
      lima: { light: { hueAdj: 12 } },
      pb: { dark: { brightness: 160, contrast: 125 }, light: { contrast: 190 } },
      cinza: { dark: { brightness: 140, contrast: 120 }, light: { contrast: 190 } },
    },
  },
  ondas: {
    dark: { brightness: 112, contrast: 105 },
    light: { opacity: 75, contrast: 130 },
    byPalette: { pb: { dark: { brightness: 120 } } },
  },
  faiscas: {
    dark: { brightness: 112 },
    light: { opacity: 100, brightness: 92, contrast: 160 },
    byPalette: { pb: { dark: { brightness: 135 }, light: { contrast: 190 } }, cinza: { dark: { brightness: 120 }, light: { contrast: 190 } } },
  },
};

/** Ponto de partida das imagens (cheias e claras): por cima do fundo, escurecidas no tema escuro. */
const IMAGE_BASE: Record<Theme, Tune> = {
  dark: { opacity: 60, brightness: 48, contrast: 115, saturate: 135 },
  light: { opacity: 42, brightness: 108, saturate: 120 },
};

const NEUTRAL = new Set<PaletteId>(["pb", "cinza"]);
const SATURATION: Partial<Record<PaletteId, number>> = { marrom: 70 };

export function presetFilters(kind: MediaKind, presetId: string, palette: PaletteId, theme: Theme): BgFilter {
  const media = kind === "video" ? findVideoPreset(presetId) : findImagePreset(presetId);
  const base = DEFAULT_FILTERS[theme];
  if (!media) return base;
  const tune = TUNE[presetId] ?? { dark: {}, light: {} };
  const { hueAdj: baseAdj = 0, ...own } = { ...(kind === "image" ? IMAGE_BASE[theme] : {}), ...tune[theme] };
  const { hueAdj = 0, ...extra } = tune.byPalette?.[palette]?.[theme] ?? {};
  const target = hueOf(paletteTokens(palette, "dark")["accent-color"]);
  const delta = (target - media.hue + 360) % 360;
  const dark = theme === "dark";
  // Imagem (cheia, clara e colorida): sem inversão, por cima do fundo e com pouca opacidade. Vídeo (luz sobre preto): soma (escuro) ou inverte e multiplica (claro).
  const img = kind === "image";
  return cleanFilter(
    {
      invert: !img && !dark,
      blend: img ? "normal" : dark ? "screen" : "multiply",
      opacity: img ? 45 : dark ? 100 : 60,
      brightness: img ? (dark ? 65 : 105) : 100,
      contrast: 100,
      hue: NEUTRAL.has(palette) ? 0 : ((dark || img ? delta : delta + 180) + baseAdj + hueAdj + 720) % 360,
      posX: base.posX,
      ...own,
      ...extra,
      saturate: NEUTRAL.has(palette) ? 0 : Math.round((extra.saturate ?? own.saturate ?? 100) * ((SATURATION[palette] ?? 100) / 100)),
    },
    theme,
  );
}

/** Filtros do preset em uso (se o ajuste automático estiver ligado); caso contrário, os que foram gravados. */
export function resolveEntryBg(bg: EntryBg, palette: PaletteId): EntryBg {
  if (!bg.auto) return bg;
  const preset = bg.mode === "video" ? bg.videoPreset : bg.mode === "image" ? bg.imagePreset : null;
  if (!preset) return bg;
  const kind: MediaKind = bg.mode === "video" ? "video" : "image";
  return { ...bg, dark: presetFilters(kind, preset, palette, "dark"), light: presetFilters(kind, preset, palette, "light") };
}

export const PALETTE_IDS = PALETTES.map((p) => p.id);
