/** Cookie com a escolha de tema do visitante ("dark" ou "light"). Lido no servidor para desenhar a página já no tema certo. */
export const THEME_COOKIE = "ddtheme";
export type ThemeChoice = "dark" | "light";

export function parseTheme(value: string | undefined | null): ThemeChoice | null {
  return value === "dark" || value === "light" ? value : null;
}
