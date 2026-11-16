import "server-only";
import { accentProblem, isHexColor, type Theme } from "@/lib/accent";
import { DEFAULT_PALETTE, PALETTES, paletteBackground, parsePalette, type PaletteId } from "@/lib/palette";
import { parseTheme, type ThemeChoice } from "@/lib/theme";
import { getSetting } from "@/server/settings";

/**
 * Cores de destaque por tema, lidas do banco com cache em memória: o layout raiz precisa delas em TODA
 * página, e a cor muda raramente. Com o cache, a página não faz consulta nenhuma ao banco na maioria
 * dos acessos; ao salvar, `invalidateAccents()` descarta o cache na hora (o prazo é só uma rede de segurança).
 */
const TTL_MS = 5 * 60_000;
// Em globalThis: o Next pode carregar este módulo mais de uma vez (layout, páginas e ações) e cada cópia teria o seu cache.
const store = globalThis as unknown as {
  __ddAccents?: { at: number; value: Record<Theme, string>; texts: Record<Theme, string>; palette: PaletteId } | null;
  __ddTheme?: { at: number; value: ThemeChoice } | null;
};

export function invalidateAccents(): void {
  store.__ddAccents = null;
  store.__ddTheme = null;
}

/** Tema de quem ainda não escolheu (em cache, como as cores). */
export async function getDefaultTheme(): Promise<ThemeChoice> {
  if (store.__ddTheme && Date.now() - store.__ddTheme.at < TTL_MS) return store.__ddTheme.value;
  try {
    const value = parseTheme(await getSetting("default_theme")) ?? "dark";
    store.__ddTheme = { at: Date.now(), value };
    return value;
  } catch {
    return "dark"; // banco fora: escuro, sem guardar no cache
  }
}

async function loadColors(): Promise<{ value: Record<Theme, string>; texts: Record<Theme, string>; palette: PaletteId }> {
  if (store.__ddAccents && Date.now() - store.__ddAccents.at < TTL_MS) return store.__ddAccents;
  let palette: PaletteId = DEFAULT_PALETTE;
  const preset = () => PALETTES.find((p) => p.id === palette) ?? PALETTES[0];
  const value: Record<Theme, string> = { dark: preset().accent.dark.color, light: preset().accent.light.color };
  const texts: Record<Theme, string> = { dark: preset().accent.dark.text, light: preset().accent.light.text };
  try {
    palette = parsePalette(await getSetting("palette"));
    value.dark = preset().accent.dark.color;
    value.light = preset().accent.light.color;
    texts.dark = preset().accent.dark.text;
    texts.light = preset().accent.light.text;
    // Cor e texto escolhidos à mão valem sobre os da paleta (vazio = usar os da paleta).
    const dark = String(await getSetting("accent_color")).toUpperCase();
    const light = String(await getSetting("accent_color_light")).toUpperCase();
    if (dark && accentProblem(dark, "dark", paletteBackground(palette, "dark")) === null) value.dark = dark;
    if (light && accentProblem(light, "light", paletteBackground(palette, "light")) === null) value.light = light;
    const textDark = String(await getSetting("button_text_dark")).toUpperCase();
    const textLight = String(await getSetting("button_text_light")).toUpperCase();
    if (isHexColor(textDark)) texts.dark = textDark;
    if (isHexColor(textLight)) texts.light = textLight;
  } catch {
    return { value, texts, palette }; // banco fora: padrão, sem guardar no cache (tenta de novo no próximo acesso)
  }
  store.__ddAccents = { at: Date.now(), value, texts, palette };
  return store.__ddAccents;
}

/** Paleta escolhida para os temas. */
export async function getPalette(): Promise<PaletteId> {
  return (await loadColors()).palette;
}

export async function getAccents(): Promise<Record<Theme, string>> {
  return (await loadColors()).value;
}

/** Cor do texto dos botões em cada tema. */
export async function getButtonTexts(): Promise<Record<Theme, string>> {
  return (await loadColors()).texts;
}
