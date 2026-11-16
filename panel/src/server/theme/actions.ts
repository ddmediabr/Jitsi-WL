"use server";

import { revalidatePath } from "next/cache";
import { accentProblem, isHexColor, type Theme } from "@/lib/accent";
import { PALETTES, paletteBackground, parsePalette } from "@/lib/palette";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { parseEntryBg } from "@/lib/entry-bg";
import { getSetting, setSetting } from "@/server/settings";
import { saveEntryBg } from "@/server/brand/brand";
import { parseTheme } from "@/lib/theme";
import { getPalette, invalidateAccents } from "./accents";

export type AccentState = { error?: string; ok?: string };

export async function saveAccentAction(_prev: AccentState, formData: FormData): Promise<AccentState> {
  const admin = await requireFullAuth("admin");
  // O tema vem do formulário, mas só vale um dos dois; qualquer outra coisa é recusada.
  const theme: Theme | null = formData.get("theme") === "dark" ? "dark" : formData.get("theme") === "light" ? "light" : null;
  if (!theme) return { error: "Tema inválido." };

  const key = theme === "dark" ? "accent_color" : "accent_color_light";
  const textKey = theme === "dark" ? "button_text_dark" : "button_text_light";
  const palette = await getPalette();

  // "restore" volta ao da paleta (limpa a escolha manual); senão valida o que veio (nunca confia no cliente).
  const reset = formData.get("restore") !== null;
  const hex = reset ? "" : String(formData.get("accent") ?? "").trim().toUpperCase();
  if (!reset) {
    const problem = accentProblem(hex, theme, paletteBackground(palette, theme));
    if (problem) return { error: problem };
  }
  // Cor do texto dos botões: só o formato é validado (a escolha é da pessoa).
  const text = reset ? "" : String(formData.get("text") ?? "").trim().toUpperCase();
  if (!reset && !isHexColor(text)) return { error: "Texto dos botões: use o formato #RRGGBB (seis dígitos hexadecimais)." };

  await setSetting(key, hex, admin.id);
  await setSetting(textKey, text, admin.id);
  invalidateAccents();
  await audit({ action: "settings.accent", actorId: admin.id, actorLabel: admin.username, targetType: "setting", targetId: key, details: { tema: theme, cor: hex || "da paleta", texto: text || "da paleta" } });
  revalidatePath("/", "layout");
  const label = theme === "dark" ? "escuro" : "claro";
  return { ok: reset ? `Cor do tema ${label} restaurada para a da paleta.` : `Cor de destaque do tema ${label} atualizada.` };
}

/** Tema que vale para quem ainda não escolheu o seu (cada pessoa pode trocar no botão de tema). */
export async function saveDefaultThemeAction(_prev: AccentState, formData: FormData): Promise<AccentState> {
  const admin = await requireFullAuth("admin");
  const theme = parseTheme(String(formData.get("theme") ?? ""));
  if (!theme) return { error: "Tema inválido." };
  await setSetting("default_theme", theme, admin.id);
  invalidateAccents();
  await audit({ action: "settings.default-theme", actorId: admin.id, actorLabel: admin.username, targetType: "setting", targetId: "default_theme", details: { tema: theme } });
  revalidatePath("/", "layout");
  return { ok: `Tema padrão: ${theme === "dark" ? "escuro" : "claro"}.` };
}

/** Troca a paleta dos temas. Vale para os dois temas e limpa as cores escolhidas à mão (a paleta traz cor e texto de botão conferidos). */
export async function savePaletteAction(_prev: AccentState, formData: FormData): Promise<AccentState> {
  const admin = await requireFullAuth("admin");
  const id = String(formData.get("palette") ?? "");
  if (!PALETTES.some((p) => p.id === id)) return { error: "Paleta inválida." };
  const palette = parsePalette(id);
  await setSetting("palette", palette, admin.id);
  for (const key of ["accent_color", "accent_color_light", "button_text_dark", "button_text_light"] as const) await setSetting(key, "", admin.id);
  invalidateAccents();
  // Fundos prontos acompanham a paleta: trocar a paleta religa o ajuste automático dos filtros (os ajustes à mão ficam guardados, mas deixam de valer).
  const bg = parseEntryBg(await getSetting("entry_bg"));
  if (!bg.auto) await saveEntryBg({ ...bg, auto: true }, admin.id);
  await audit({ action: "settings.palette", actorId: admin.id, actorLabel: admin.username, targetType: "setting", targetId: "palette", details: { paleta: palette } });
  revalidatePath("/", "layout");
  return { ok: `Paleta ${PALETTES.find((p) => p.id === palette)?.label.toLowerCase()} aplicada aos dois temas.` };
}
