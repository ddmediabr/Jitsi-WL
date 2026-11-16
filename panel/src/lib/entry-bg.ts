/**
 * Fundo das páginas de entrada (vídeo em laço ou imagem) e a regulagem de filtros CSS de cada tema.
 * Módulo puro: roda no servidor (validação) e no navegador (prévia e desenho do fundo).
 */
export type Theme = "dark" | "light";
export type BgMode = "none" | "video" | "image";

export const BLENDS = ["normal", "screen", "multiply", "overlay", "lighten", "darken"] as const;
export type Blend = (typeof BLENDS)[number];
export const BLEND_LABEL: Record<Blend, string> = {
  normal: "Normal (por cima)",
  screen: "Clarear (screen): o preto some",
  multiply: "Escurecer (multiply): o branco some",
  overlay: "Sobrepor (overlay)",
  lighten: "Só o mais claro",
  darken: "Só o mais escuro",
};

export type BgFilter = {
  /** Inverte as cores (linhas pretas em fundo branco viram linhas brancas em fundo preto). */
  invert: boolean;
  blend: Blend;
  /** 0 a 100. */
  opacity: number;
  /** 50 a 150 (%). */
  brightness: number;
  /** 50 a 150 (%). */
  contrast: number;
  /** 0 a 200 (%). */
  saturate: number;
  /** 0 a 360 (graus). */
  hue: number;
  /** Posição horizontal do enquadramento, 0 (esquerda) a 100 (direita). */
  posX: number;
};

export type EntryBg = {
  mode: BgMode;
  /** true: quem ativou "reduzir movimento" no sistema vê o vídeo parado no primeiro quadro. false: o vídeo toca para todos. */
  respectMotion: boolean;
  /** Preset de vídeo / de imagem em uso (null: o arquivo enviado pela pessoa). */
  videoPreset: string | null;
  imagePreset: string | null;
  /** true: com um preset, os filtros vêm do ajuste pronto da paleta atual; false: valem os filtros gravados. */
  auto: boolean;
  dark: BgFilter;
  light: BgFilter;
};

/** Os padrões foram feitos para o vídeo de linhas pretas sobre branco: no escuro vira linhas brancas sobre o fundo do tema; no claro, linhas suaves. */
export const DEFAULT_FILTERS: Record<Theme, BgFilter> = {
  dark: { invert: true, blend: "screen", opacity: 100, brightness: 100, contrast: 100, saturate: 100, hue: 0, posX: 30 },
  light: { invert: false, blend: "multiply", opacity: 55, brightness: 100, contrast: 100, saturate: 100, hue: 0, posX: 30 },
};

export const DEFAULT_ENTRY_BG: EntryBg = { mode: "none", respectMotion: false, videoPreset: null, imagePreset: null, auto: true, dark: DEFAULT_FILTERS.dark, light: DEFAULT_FILTERS.light };

export const RANGES = {
  opacity: { min: 0, max: 100, step: 1, unit: "%", label: "Opacidade" },
  brightness: { min: 50, max: 150, step: 1, unit: "%", label: "Brilho" },
  contrast: { min: 50, max: 150, step: 1, unit: "%", label: "Contraste" },
  saturate: { min: 0, max: 200, step: 1, unit: "%", label: "Saturação" },
  hue: { min: 0, max: 360, step: 1, unit: "°", label: "Matiz" },
  posX: { min: 0, max: 100, step: 1, unit: "%", label: "Enquadramento horizontal" },
} as const;
export type RangeKey = keyof typeof RANGES;

const num = (v: unknown, key: RangeKey, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  const { min, max } = RANGES[key];
  return Math.min(max, Math.max(min, Math.round(n)));
};

export function cleanFilter(raw: unknown, theme: Theme): BgFilter {
  const d = DEFAULT_FILTERS[theme];
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    invert: typeof o.invert === "boolean" ? o.invert : d.invert,
    blend: BLENDS.find((b) => b === o.blend) ?? d.blend,
    opacity: num(o.opacity, "opacity", d.opacity),
    brightness: num(o.brightness, "brightness", d.brightness),
    contrast: num(o.contrast, "contrast", d.contrast),
    saturate: num(o.saturate, "saturate", d.saturate),
    hue: num(o.hue, "hue", d.hue),
    posX: num(o.posX, "posX", d.posX),
  };
}

/** Lê o JSON guardado nas configurações; qualquer valor fora do esperado volta ao padrão. */
export function parseEntryBg(raw: unknown): EntryBg {
  let o: Record<string, unknown> = {};
  try {
    const parsed = typeof raw === "string" && raw !== "" ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === "object") o = parsed as Record<string, unknown>;
  } catch {
    /* JSON inválido: padrão */
  }
  const mode: BgMode = o.mode === "video" || o.mode === "image" ? o.mode : "none";
  const preset = (v: unknown) => (typeof v === "string" && /^[a-z0-9-]{1,40}$/.test(v) ? v : null);
  return { mode, respectMotion: o.respectMotion === true, videoPreset: preset(o.videoPreset), imagePreset: preset(o.imagePreset), auto: o.auto !== false, dark: cleanFilter(o.dark, "dark"), light: cleanFilter(o.light, "light") };
}

/** Valor da propriedade CSS `filter` (cada função só entra se mudar alguma coisa). */
export function filterCss(f: BgFilter): string {
  const parts: string[] = [];
  if (f.invert) parts.push("invert(1)");
  if (f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
  if (f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
  if (f.saturate !== 100) parts.push(`saturate(${f.saturate}%)`);
  if (f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`);
  return parts.length ? parts.join(" ") : "none";
}

/** Variáveis CSS (por tema) usadas por `.entry-bg` no globals.css. */
export function bgVars(bg: EntryBg): Record<string, string> {
  const one = (t: Theme) => {
    const f = bg[t];
    return {
      [`--bg-filter-${t}`]: filterCss(f),
      [`--bg-blend-${t}`]: f.blend,
      [`--bg-opacity-${t}`]: String(f.opacity / 100),
      [`--bg-x-${t}`]: `${f.posX}%`,
    };
  };
  return { ...one("dark"), ...one("light") };
}
