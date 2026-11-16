/**
 * Paletas do painel: o azul do produto e variações em outros matizes (roxo, verde, amarelo, vermelho, laranja, lima).
 * Cada paleta é GERADA a partir do conjunto de tokens azul (docs/DESIGN.md) girando o matiz no espaço OKLCH, que preserva a
 * claridade, e por isso o contraste. Depois, os tokens de texto são ajustados para manter o contraste mínimo (WCAG AA).
 * A cor de destaque e o texto dos botões de cada paleta são fixos e já conferidos. Módulo puro: roda no servidor e no navegador.
 */
export type Theme = "dark" | "light";
export type PaletteId = "azul" | "roxo" | "verde" | "amarelo" | "vermelho" | "laranja" | "lima" | "marrom" | "pb" | "cinza";

type Tokens = Record<string, string>;

/* ---------- conversões de cor ---------- */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

type Lch = { l: number; c: number; h: number };

function rgbToLch(r: number, g: number, b: number): Lch {
  const [lr, lg, lb] = [r, g, b].map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI };
}

function lchToRgbRaw({ l, c, h }: Lch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lr = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const lg = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const lb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return [lr, lg, lb];
}

/** OKLCH -> sRGB 0..255; se sair da gama, reduz a croma até caber (sem mudar claridade nem matiz). */
function lchToRgb(lch: Lch): [number, number, number] {
  let c = lch.c;
  for (let i = 0; i < 24; i++) {
    const [lr, lg, lb] = lchToRgbRaw({ ...lch, c });
    if ([lr, lg, lb].every((v) => v >= -0.0005 && v <= 1.0005)) return [lr, lg, lb].map((v) => Math.round(fromLinear(clamp01(v)) * 255)) as [number, number, number];
    c *= 0.93;
  }
  const [lr, lg, lb] = lchToRgbRaw({ ...lch, c: 0 });
  return [lr, lg, lb].map((v) => Math.round(fromLinear(clamp01(v)) * 255)) as [number, number, number];
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0");
const toHex = ([r, g, b]: [number, number, number]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;
const parseHex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(parseHex(a)), luminance(parseHex(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Gira o matiz de TODAS as cores (#rrggbb e rgba(...)) que aparecem num texto de token. Cores neutras (croma 0) não mudam. */
function shiftColors(value: string, delta: number, scale = 1): string {
  const shift = (r: number, g: number, b: number): [number, number, number] => {
    const lch = rgbToLch(r, g, b);
    return lch.c < 0.004 ? [r, g, b] : lchToRgb({ ...lch, c: lch.c * scale, h: lch.h + delta });
  };
  return value
    .replace(/#([0-9a-fA-F]{6})\b/g, (_, h: string) => toHex(shift(...parseHex(`#${h}`))))
    .replace(/rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/g, (_, r: string, g: string, b: string, a: string) => {
      const [nr, ng, nb] = shift(Number(r), Number(g), Number(b));
      return `rgba(${nr}, ${ng}, ${nb}, ${a})`;
    });
}

/* ---------- tokens-base (o azul do produto, igual ao globals.css) ---------- */
const BASE: Record<Theme, Tokens> = {
  light: {
    background: "#f2f6fc",
    foreground: "#0a1a33",
    card: "#ffffff",
    "card-foreground": "#0a1a33",
    popover: "#ffffff",
    "popover-foreground": "#0a1a33",
    secondary: "#eaf0f9",
    "secondary-foreground": "#0a1a33",
    muted: "#eaf0f9",
    "muted-foreground": "#566a88",
    accent: "rgba(10, 26, 51, 0.045)",
    "accent-foreground": "#0a1a33",
    border: "#e0e7f2",
    input: "#d3dcea",
    ring: "#38a3ff",
    sidebar: "#ffffff",
    "sidebar-foreground": "#566a88",
    "sidebar-accent": "rgba(10, 98, 212, 0.09)",
    "sidebar-accent-foreground": "#0a4fb0",
    "sidebar-border": "#e0e7f2",
    "sidebar-ring": "#38a3ff",
    link: "#0a62d4",
    "icon-bg": "rgba(10, 98, 212, 0.09)",
    "icon-fg": "#0a62d4",
    "status-off": "#8a9bb5",
    faint: "#5f7390",
    "shadow-card": "0 1px 2px rgba(10, 26, 51, 0.05), 0 10px 28px rgba(10, 26, 51, 0.05)",
    "page-glow": "radial-gradient(900px 420px at 10% -10%, rgba(10, 110, 255, 0.08), transparent 62%)",
  },
  dark: {
    background: "#040b17",
    foreground: "#eef4ff",
    card: "#0e1626",
    "card-foreground": "#eef4ff",
    popover: "#0e1626",
    "popover-foreground": "#eef4ff",
    secondary: "rgba(255, 255, 255, 0.07)",
    "secondary-foreground": "#eef4ff",
    muted: "rgba(255, 255, 255, 0.07)",
    "muted-foreground": "#93a6c4",
    accent: "rgba(255, 255, 255, 0.06)",
    "accent-foreground": "#eef4ff",
    border: "rgba(255, 255, 255, 0.09)",
    input: "rgba(255, 255, 255, 0.13)",
    ring: "#38a3ff",
    sidebar: "#071220",
    "sidebar-foreground": "#93a6c4",
    "sidebar-accent": "rgba(56, 163, 255, 0.15)",
    "sidebar-accent-foreground": "#d6ebff",
    "sidebar-border": "rgba(255, 255, 255, 0.09)",
    "sidebar-ring": "#38a3ff",
    link: "#5db4ff",
    "icon-bg": "rgba(56, 163, 255, 0.14)",
    "icon-fg": "#6bbcff",
    "status-off": "#7f94b3",
    faint: "#7488a8",
    "shadow-card": "0 1px 0 rgba(255, 255, 255, 0.05) inset, 0 14px 34px rgba(0, 0, 0, 0.35)",
    "page-glow":
      "radial-gradient(900px 460px at 12% -8%, rgba(10, 110, 255, 0.2), transparent 62%), radial-gradient(760px 420px at 100% 4%, rgba(70, 80, 210, 0.15), transparent 62%)",
  },
};


/** Cores da tela de login (fixas no azul do produto; as outras paletas giram o matiz). Valem para os dois temas: a tela é sempre escura. */
const AUTH_BASE: Tokens = {
  "auth-bg-a": "#041c38",
  "auth-bg-b": "#021a36",
  "auth-bg-c": "#00142d",
  "auth-glow-a1": "#064386",
  "auth-glow-a2": "rgba(6, 67, 134, 0.6)",
  "auth-glow-a3": "rgba(6, 44, 91, 0.3)",
  "auth-glow-b1": "#15204e",
  "auth-glow-b2": "rgba(21, 32, 78, 0.6)",
  "auth-glow-c": "rgba(27, 57, 93, 0.75)",
  "auth-input": "rgba(6, 18, 40, 0.5)",
};

/* ---------- paletas ---------- */
type Preset = {
  id: PaletteId;
  label: string;
  /** Giro de matiz (graus) em relação ao azul. */
  shift: number;
  /** Multiplica a croma (cor) dos tokens: 1 mantém, 0 deixa tudo em tons de cinza. */
  chroma?: number;
  /** Tokens fixados à mão por tema, aplicados depois do giro de matiz. */
  overrides?: Record<Theme, Tokens>;
  /** Cor de destaque e texto dos botões, por tema (escolhidos à mão e conferidos: texto 4,5:1 e destaque 3:1 com o fundo). */
  accent: Record<Theme, { color: string; text: string }>;
};

export const PALETTES: Preset[] = [
  { id: "azul", label: "Azul (Padrão)", shift: 0, accent: { dark: { color: "#0A74E6", text: "#FFFFFF" }, light: { color: "#0A74E6", text: "#FFFFFF" } } },
  { id: "roxo", label: "Roxo", shift: 45, accent: { dark: { color: "#7C3AED", text: "#FFFFFF" }, light: { color: "#6D28D9", text: "#FFFFFF" } } },
  { id: "verde", label: "Verde", shift: -105, accent: { dark: { color: "#22C55E", text: "#04130A" }, light: { color: "#15803D", text: "#FFFFFF" } } },
  { id: "amarelo", label: "Amarelo", shift: -160, accent: { dark: { color: "#EAB308", text: "#1A1300" }, light: { color: "#A16207", text: "#FFFFFF" } } },
  { id: "vermelho", label: "Vermelho", shift: 130, accent: { dark: { color: "#DC2626", text: "#FFFFFF" }, light: { color: "#B91C1C", text: "#FFFFFF" } } },
  { id: "laranja", label: "Laranja", shift: 160, accent: { dark: { color: "#F97316", text: "#1A0B00" }, light: { color: "#C2410C", text: "#FFFFFF" } } },
  // Base #E8F963 (matiz OKLCH ≈ 115°). No claro, o destaque escurece para #4D7C0F (4,6:1 com o fundo, 5,0:1 com o texto branco).
  { id: "lima", label: "Lima", shift: 217, accent: { dark: { color: "#E8F963", text: "#1A1F00" }, light: { color: "#4D7C0F", text: "#FFFFFF" } } },
  { id: "marrom", label: "Marrom", shift: 156, chroma: 0.55, accent: { dark: { color: "#C88A5A", text: "#1A0F05" }, light: { color: "#8A5530", text: "#FFFFFF" } } },
  {
    id: "pb",
    label: "Preto e branco",
    shift: 0,
    chroma: 0,
    accent: { dark: { color: "#FFFFFF", text: "#000000" }, light: { color: "#000000", text: "#FFFFFF" } },
    overrides: {
      dark: { background: "#000000", card: "#0a0a0a", popover: "#0a0a0a", sidebar: "#000000", foreground: "#ffffff", "card-foreground": "#ffffff", "popover-foreground": "#ffffff", "secondary-foreground": "#ffffff", "accent-foreground": "#ffffff", "sidebar-accent-foreground": "#ffffff" },
      light: { background: "#ffffff", card: "#ffffff", popover: "#ffffff", sidebar: "#ffffff", foreground: "#000000", "card-foreground": "#000000", "popover-foreground": "#000000", "secondary-foreground": "#000000", "accent-foreground": "#000000", "sidebar-accent-foreground": "#000000" },
    },
  },
  { id: "cinza", label: "Cinza", shift: 0, chroma: 0, accent: { dark: { color: "#A3A3A3", text: "#0A0A0A" }, light: { color: "#525252", text: "#FFFFFF" } } },
];

export const DEFAULT_PALETTE: PaletteId = "azul";
export const parsePalette = (v: unknown): PaletteId => PALETTES.find((p) => p.id === v)?.id ?? DEFAULT_PALETTE;

/** Tokens de texto/ícone que precisam de contraste mínimo com o fundo e o card. */
const TEXT_TOKENS: [string, number][] = [
  ["muted-foreground", 4.5],
  ["sidebar-foreground", 4.5],
  ["faint", 4.5],
  ["link", 4.5],
  ["icon-fg", 4.5],
  ["sidebar-accent-foreground", 4.5],
  ["status-off", 3],
];

/** Ajusta só a claridade (mantendo matiz e croma) até a cor atingir o contraste pedido com todos os fundos dados. */
function ensureContrast(color: string, backgrounds: string[], min: number, dark: boolean): string {
  const ok = (c: string) => backgrounds.every((bg) => contrast(c, bg) >= min);
  if (ok(color)) return color;
  const lch = rgbToLch(...parseHex(color));
  for (let i = 1; i <= 60; i++) {
    const l = clamp01(lch.l + (dark ? 1 : -1) * i * 0.01);
    const candidate = toHex(lchToRgb({ ...lch, l }));
    if (ok(candidate)) return candidate;
  }
  return color;
}

const cache = new Map<string, Tokens>();

/** Tokens da paleta para um tema (nomes sem o prefixo "--"). Inclui a cor de destaque (`accent-color` e `accent-text`). */
export function paletteTokens(id: PaletteId, theme: Theme): Tokens {
  const key = `${id}:${theme}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const preset = PALETTES.find((p) => p.id === id) ?? PALETTES[0];
  const tokens: Tokens = {};
  for (const [name, value] of Object.entries(BASE[theme])) tokens[name] = preset.shift === 0 && preset.chroma === undefined ? value : shiftColors(value, preset.shift, preset.chroma ?? 1);
  Object.assign(tokens, preset.overrides?.[theme]);
  for (const [name, value] of Object.entries(AUTH_BASE)) tokens[name] = preset.shift === 0 && preset.chroma === undefined ? value : shiftColors(value, preset.shift, preset.chroma ?? 1);
  const bg = tokens.background;
  const surfaces = [bg, tokens.card];
  for (const [name, min] of TEXT_TOKENS) tokens[name] = ensureContrast(tokens[name], name === "sidebar-foreground" || name === "sidebar-accent-foreground" ? [tokens.sidebar] : surfaces, min, theme === "dark");
  tokens["accent-color"] = preset.accent[theme].color;
  tokens["accent-text"] = preset.accent[theme].text;
  // Tela de login: sempre escura, então usa a cor de destaque do tema escuro, com o degradê do botão em torno dela.
  const darkAccent = preset.accent.dark;
  const accentLch = rgbToLch(...parseHex(darkAccent.color));
  const tone = (dl: number) => toHex(lchToRgb({ ...accentLch, l: clamp01(accentLch.l + dl) }));
  tokens["auth-primary"] = darkAccent.color;
  tokens["auth-btn-fg"] = darkAccent.text;
  // Destaque muito claro (como o lima) não clareia mais: o degradê escurece para o fim, senão o botão acaba quase branco.
  const light = accentLch.l > 0.85;
  tokens["auth-btn-1"] = light ? darkAccent.color : tone(-0.05);
  tokens["auth-btn-2"] = light ? tone(-0.04) : darkAccent.color;
  tokens["auth-btn-3"] = light ? tone(-0.09) : tone(0.05);
  tokens["auth-btn-shadow"] = `rgba(${parseHex(darkAccent.color).join(", ")}, 0.55)`;
  tokens["sidebar-primary"] = preset.accent[theme].color;
  tokens["sidebar-primary-foreground"] = preset.accent[theme].text;
  tokens.ring = ensureContrast(shiftColors(BASE[theme].ring, preset.shift, preset.chroma ?? 1), [bg], 3, theme === "dark");
  tokens["sidebar-ring"] = tokens.ring;
  cache.set(key, tokens);
  return tokens;
}

/** Fundo do tema na paleta (usado para medir o contraste da cor de destaque). */
export const paletteBackground = (id: PaletteId, theme: Theme): string => paletteTokens(id, theme).background.toUpperCase();

/** CSS que sobrescreve os tokens do globals.css com os da paleta (os dois temas). Vazio para o azul, que já é o padrão do CSS. */
export function paletteCss(id: PaletteId): string {
  if (id === DEFAULT_PALETTE) return "";
  const block = (theme: Theme) =>
    Object.entries(paletteTokens(id, theme))
      .filter(([name]) => name !== "accent-color" && name !== "accent-text")
      .map(([name, value]) => `--${name}:${value}`)
      .join(";");
  return `html:root{${block("light")}}html.dark{${block("dark")}}`;
}
