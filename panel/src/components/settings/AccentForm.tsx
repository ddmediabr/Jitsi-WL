"use client";

import { useActionState, useState } from "react";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accentProblem, isHexColor, presetsFor, THEME_LABEL, type Theme } from "@/lib/accent";
import { PALETTES, paletteBackground, type PaletteId } from "@/lib/palette";
import { saveAccentAction, type AccentState } from "@/server/theme/actions";

const initial: AccentState = {};
const THEMES: Theme[] = ["dark", "light"];

export default function AccentForm({ current, currentText, palette }: { current: Record<Theme, string>; currentText: Record<Theme, string>; palette: PaletteId }) {
  const preset = PALETTES.find((p) => p.id === palette) ?? PALETTES[0];
  const bgOf = (t: Theme) => paletteBackground(palette, t);
  const [state, action, pending] = useActionState(saveAccentAction, initial);
  const [theme, setTheme] = useState<Theme>("dark");
  const [draft, setDraft] = useState<Record<Theme, string>>(current);
  const [textDraft, setTextDraft] = useState<Record<Theme, string>>(currentText);
  const hex = draft[theme];
  const value = hex.trim().toUpperCase();
  const problem = accentProblem(value, theme, bgOf(theme));
  const setHex = (v: string) => setDraft((d) => ({ ...d, [theme]: v }));
  const text = textDraft[theme].trim().toUpperCase();
  const setText = (v: string) => setTextDraft((d) => ({ ...d, [theme]: v }));
  const textProblem = isHexColor(text) ? null : "Use o formato #RRGGBB (seis dígitos hexadecimais).";
  const previewFg = problem === null && textProblem === null ? text : null;
  return (
    <form action={action} className="grid max-w-none gap-5" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <input type="hidden" name="theme" value={theme} />

      <div role="tablist" aria-label="Tema" className="inline-flex w-fit rounded-lg border p-1">
        {THEMES.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={theme === t}
            onClick={() => setTheme(t)}
            className="rounded-md px-4 py-1.5 text-sm leading-normal transition-colors duration-150 ease-out aria-selected:bg-primary aria-selected:text-primary-foreground"
          >
            Tema {THEME_LABEL[t].toLowerCase()}
          </button>
        ))}
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm leading-normal font-medium">Sugestões</legend>
        <div className="flex flex-wrap gap-2">
          {presetsFor(theme, preset.accent[theme].color).map((p) => {
            const usable = accentProblem(p.hex, theme, bgOf(theme)) === null;
            return (
              <button
                key={p.name}
                type="button"
                disabled={!usable}
                onClick={() => setHex(p.hex)}
                aria-label={`${p.name} (${p.hex})${usable ? "" : ": contraste insuficiente neste tema"}`}
                aria-pressed={value === p.hex.toUpperCase()}
                title={usable ? p.name : `${p.name}: sem contraste com o fundo ${theme === "dark" ? "escuro" : "claro"}`}
                className="size-9 rounded-full border-2 border-border outline-offset-2 transition-transform duration-150 ease-out hover:scale-105 focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100 aria-pressed:border-foreground"
                style={{ backgroundColor: p.hex }}
              />
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="accent">Cor personalizada (hexadecimal)</Label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Seletor de cor"
            value={isHexColor(value) ? value.toLowerCase() : current[theme].toLowerCase()}
            onChange={(e) => setHex(e.target.value.toUpperCase())}
            className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
          />
          <Input id="accent" name="accent" value={hex} onChange={(e) => setHex(e.target.value)} autoComplete="off" spellCheck={false} maxLength={7} className="w-40 font-mono" />
        </div>
        {problem ? <p className="text-xs leading-normal text-destructive">{problem}</p> : null}
        <p className="text-xs leading-normal text-muted-foreground">
          Muda os botões e realces do sistema neste tema. Os fundos vêm da paleta escolhida ({bgOf("dark")} no escuro e {bgOf("light")} no claro).
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="text">Cor do texto dos botões (hexadecimal)</Label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            aria-label="Seletor de cor do texto"
            value={isHexColor(text) ? text.toLowerCase() : currentText[theme].toLowerCase()}
            onChange={(e) => setText(e.target.value.toUpperCase())}
            className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
          />
          <Input id="text" name="text" value={textDraft[theme]} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} maxLength={7} className="w-40 font-mono" />
          <Button type="button" variant="outline" size="sm" onClick={() => setText("#FFFFFF")}>Branco</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setText("#000000")}>Preto</Button>
        </div>
        {textProblem ? <p className="text-xs leading-normal text-destructive">{textProblem}</p> : null}
        <p className="text-xs leading-normal text-muted-foreground">
          Cor das letras dentro dos botões neste tema.
        </p>
      </div>

      {previewFg !== null && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Prévia</span>
          <span
            className="inline-flex items-center rounded-lg border px-4 py-3"
            style={{ backgroundColor: bgOf(theme), borderColor: theme === "dark" ? "#2a2a26" : "#e4e4e0" }}
          >
            <span className="rounded-md px-3 py-1.5 text-sm font-medium" style={{ backgroundColor: value, color: previewFg }}>
              Botão de exemplo
            </span>
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending || problem !== null || textProblem !== null}>
          {pending ? "Salvando…" : `Salvar cores do tema ${THEME_LABEL[theme].toLowerCase()}`}
        </Button>
        <Button type="submit" name="restore" value="1" variant="outline" disabled={pending}>
          Restaurar padrão
        </Button>
      </div>
    </form>
  );
}
