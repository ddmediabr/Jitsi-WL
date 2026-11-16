/**
 * Cor de destaque do sistema (botões e realces), uma para cada tema. Só a cor de destaque é editável:
 * os fundos são fixos (#040B17 no escuro, #F2F6FC no claro).
 * Módulo puro: roda no servidor (validação) e no navegador (prévia).
 */
export type Theme = "dark" | "light";

export const BACKGROUNDS: Record<Theme, string> = { dark: "#040B17", light: "#F2F6FC" };
/** Padrão do produto: o azul do design, nos dois temas (editável em Personalização). */
export const DEFAULT_ACCENTS: Record<Theme, string> = { dark: "#0A74E6", light: "#0A74E6" };
export const DEFAULT_ACCENT = DEFAULT_ACCENTS.dark;
export const THEME_LABEL: Record<Theme, string> = { dark: "Escuro", light: "Claro" };

export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: "Padrão da marca", hex: "" }, // preenchido por tema na tela
  { name: "Azul", hex: "#3B82F6" },
  { name: "Ciano", hex: "#06B6D4" },
  { name: "Verde", hex: "#22C55E" },
  { name: "Amarelo", hex: "#EAB308" },
  { name: "Laranja", hex: "#F97316" },
  { name: "Vermelho", hex: "#EF4444" },
  { name: "Rosa", hex: "#EC4899" },
  { name: "Roxo", hex: "#8B5CF6" },
  { name: "Preto", hex: "#000000" },
  { name: "Branco", hex: "#FFFFFF" },
];

/** Sugestões já resolvidas para o tema (o primeiro item vira o padrão daquele tema). */
export function presetsFor(theme: Theme, defaultHex: string = DEFAULT_ACCENTS[theme]): { name: string; hex: string }[] {
  return ACCENT_PRESETS.map((p) => (p.hex === "" ? { ...p, hex: defaultHex } : p));
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

function luminance(hex: string): number {
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Cor padrão do texto dos botões em cada tema (escolhida pela pessoa em Personalização; nada é calculado). */
export const DEFAULT_BUTTON_TEXT: Record<Theme, string> = { dark: "#FFFFFF", light: "#FFFFFF" };

/** Erro em português, ou null se a cor servir naquele tema (contraste mínimo de 3:1 com o fundo). */
export function accentProblem(hex: string, theme: Theme = "dark", background: string = BACKGROUNDS[theme]): string | null {
  if (!isHexColor(hex)) return "Use o formato #RRGGBB (seis dígitos hexadecimais).";
  if (contrastRatio(hex, background) < 3) {
    return theme === "dark"
      ? "Cor escura demais: ela quase some no fundo escuro. Escolha uma mais clara."
      : "Cor clara demais: ela quase some no fundo claro. Escolha uma mais escura.";
  }
  return null;
}
