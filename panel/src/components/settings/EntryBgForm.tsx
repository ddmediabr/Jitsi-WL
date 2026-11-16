"use client";

import { useActionState, useRef, useState } from "react";
import { EntryBackgroundView } from "@/components/EntryBackground";
import { BrandAssetForm } from "@/components/settings/BrandForms";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Brand } from "@/lib/brand";
import { BLEND_LABEL, BLENDS, cleanFilter, DEFAULT_FILTERS, filterCss, RANGES, type BgFilter, type BgMode, type EntryBg, type RangeKey, type Theme } from "@/lib/entry-bg";
import { IMAGE_PRESETS, VIDEO_PRESETS, type PresetMedia } from "@/lib/entry-preset-list";
import { presetFilters, type MediaKind } from "@/lib/entry-presets";
import type { PaletteId } from "@/lib/palette";
import { saveEntryBgAction, type BrandFormState } from "@/server/brand/actions";

const initial: BrandFormState = {};
const THEMES: Theme[] = ["dark", "light"];
const THEME_NAME: Record<Theme, string> = { dark: "escuro", light: "claro" };
const SLIDERS: RangeKey[] = ["opacity", "brightness", "contrast", "saturate", "hue", "posX"];
const MODES: { value: BgMode; label: string; help: string }[] = [
  { value: "none", label: "Sem fundo", help: "Fundo liso da paleta." },
  { value: "video", label: "Vídeo em laço", help: "Toca sem áudio, em repetição." },
  { value: "image", label: "Imagem", help: "Imagem estática." },
];
const FORM_ID = "entry-bg-form";
const CONFIG_TYPE = "dd-entry-bg-filters";

/** Cartão de escolha da origem da mídia: o arquivo enviado ou um dos prontos. */
function Pick({ selected, disabled, onSelect, children, label, className }: { selected: boolean; disabled?: boolean; onSelect: () => void; children: React.ReactNode; label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onSelect}
      className={`grid gap-2 rounded-xl border p-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-primary aria-pressed:bg-accent ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** Miniatura de um preset já com o ajuste da paleta atual (tema escuro). */
function PresetThumb({ kind, preset, palette, background }: { kind: MediaKind; preset: PresetMedia; palette: PaletteId; background: string }) {
  const f = presetFilters(kind, preset.id, palette, "dark");
  return (
    <span className="relative isolate block aspect-video overflow-hidden rounded-lg" style={{ backgroundColor: background }} aria-hidden="true">
      <span className="absolute inset-0" style={{ filter: filterCss(f), mixBlendMode: f.blend, opacity: f.opacity / 100 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preset.thumb} alt="" className="size-full object-cover" loading="lazy" />
      </span>
    </span>
  );
}

/** Fundo das páginas de entrada: tipo, origem da mídia (envio ou preset), filtros por tema, importação/exportação e prévia ao vivo. */
export default function EntryBgForm({ brand, backgrounds, palette }: { brand: Brand; backgrounds: Record<Theme, string>; palette: PaletteId }) {
  const [state, action, pending] = useActionState(saveEntryBgAction, initial);
  const [mode, setMode] = useState<BgMode>(brand.entryBg.mode);
  const [respectMotion, setRespectMotion] = useState(brand.entryBg.respectMotion);
  const [videoPreset, setVideoPreset] = useState<string | null>(brand.entryBg.videoPreset);
  const [imagePreset, setImagePreset] = useState<string | null>(brand.entryBg.imagePreset);
  const [auto, setAuto] = useState(brand.entryBg.auto);
  const [theme, setTheme] = useState<Theme>("dark");
  const [filters, setFilters] = useState<Record<Theme, BgFilter>>({ dark: brand.entryBg.dark, light: brand.entryBg.light });
  const [portable, setPortable] = useState<{ error?: string; ok?: string }>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const kind: MediaKind = mode === "image" ? "image" : "video";
  const preset = mode === "video" ? videoPreset : mode === "image" ? imagePreset : null;
  const followsPalette = auto && preset !== null;
  // Filtros em uso: os do ajuste pronto da paleta (se ligado e há preset) ou os da pessoa.
  const effective: Record<Theme, BgFilter> = followsPalette
    ? { dark: presetFilters(kind, preset, palette, "dark"), light: presetFilters(kind, preset, palette, "light") }
    : filters;
  const f = effective[theme];
  // Mexer em qualquer controle copia o ajuste atual para o "personalizado" e desliga o automático.
  const set = (patch: Partial<BgFilter>) => {
    setFilters({ ...effective, [theme]: { ...effective[theme], ...patch } });
    setAuto(false);
  };
  const live: EntryBg = { mode, respectMotion, videoPreset, imagePreset, auto: false, dark: effective.dark, light: effective.light };
  const uploaded = mode === "video" ? brand.entryVideoVersion !== null : brand.entryImageVersion !== null;
  const presets = mode === "video" ? VIDEO_PRESETS : IMAGE_PRESETS;
  const setPreset = (id: string | null) => (mode === "video" ? setVideoPreset(id) : setImagePreset(id));
  const ready = preset !== null || uploaded;

  const exportConfig = () => {
    const data = JSON.stringify({ type: CONFIG_TYPE, version: 1, dark: effective.dark, light: effective.light }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "filtros-do-fundo.json";
    a.click();
    URL.revokeObjectURL(url);
    setPortable({ ok: "Configuração exportada." });
  };
  const importConfig = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 20_000) throw new Error("size");
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      if (raw.type !== CONFIG_TYPE || typeof raw.dark !== "object" || typeof raw.light !== "object") throw new Error("shape");
      setFilters({ dark: cleanFilter(raw.dark, "dark"), light: cleanFilter(raw.light, "light") });
      setAuto(false);
      setPortable({ ok: "Configuração importada. Confira a prévia e clique em Salvar fundo." });
    } catch {
      setPortable({ error: "Arquivo inválido. Importe um JSON exportado por esta tela." });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="grid gap-8">
      <form id={FORM_ID} action={action} noValidate hidden>
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="respect_motion" value={respectMotion ? "on" : "off"} />
        <input type="hidden" name="video_preset" value={videoPreset ?? ""} />
        <input type="hidden" name="image_preset" value={imagePreset ?? ""} />
        <input type="hidden" name="auto" value={followsPalette ? "on" : "off"} />
        {THEMES.map((t) => (
          <span key={t}>
            <input type="hidden" name={`${t}_invert`} value={effective[t].invert ? "on" : "off"} />
            <input type="hidden" name={`${t}_blend`} value={effective[t].blend} />
            {SLIDERS.map((k) => (
              <input key={k} type="hidden" name={`${t}_${k}`} value={effective[t][k]} />
            ))}
          </span>
        ))}
      </form>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm leading-normal font-medium">Tipo de fundo</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <label key={m.value} className="grid cursor-pointer gap-1 rounded-xl border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent">
              <span className="flex items-center gap-3 font-medium">
                <input type="radio" name="mode-choice" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} />
                {m.label}
              </span>
              <span className="pl-[30px] text-xs leading-normal text-muted-foreground">{m.help}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode !== "none" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid content-start gap-3">
            <BrandAssetForm key={mode} kind={mode === "video" ? "entry_video" : "entry_image"} version={mode === "video" ? brand.entryVideoVersion : brand.entryImageVersion} />
            {uploaded && (
              <Pick selected={preset === null} onSelect={() => setPreset(null)} label={mode === "video" ? "Usar o vídeo enviado" : "Usar a imagem enviada"} className="w-fit">
                <span className="text-sm font-medium">{mode === "video" ? "Usar o vídeo enviado" : "Usar a imagem enviada"}</span>
              </Pick>
            )}
          </div>
          <div className="grid content-start gap-3">
            <h3 className="text-sm leading-normal font-medium">{mode === "video" ? "Vídeos prontos" : "Imagens prontas"}</h3>
            {presets.length === 0 ? (
              <p className="text-xs leading-normal text-muted-foreground">As imagens prontas serão adicionadas aqui.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {presets.map((p) => (
                  <Pick key={p.id} selected={preset === p.id} onSelect={() => setPreset(p.id)} label={p.label}>
                    <PresetThumb kind={kind} preset={p} palette={palette} background={backgrounds.dark} />
                    <span className="px-1 text-xs font-medium">{p.label}</span>
                  </Pick>
                ))}
              </div>
            )}
            <p className="text-xs leading-normal text-muted-foreground">Cada pronto já vem ajustado à paleta atual.</p>
          </div>
        </div>
      )}

      {mode !== "none" && (
        <div className="grid gap-6">
          {mode === "video" && (
            <label className="flex min-h-11 items-start gap-3 text-sm leading-normal">
              <input type="checkbox" className="mt-1" checked={respectMotion} onChange={(e) => setRespectMotion(e.target.checked)} />
              <span>
                Parar o vídeo para quem ativou &ldquo;reduzir movimento&rdquo; no sistema
                <span className="block text-xs text-muted-foreground">
                  Essas pessoas veem só o primeiro quadro. Desmarcado (padrão), o vídeo toca para todos.
                </span>
              </span>
            </label>
          )}

          <div className="grid gap-3">
            <h3 className="text-sm leading-normal font-medium">Filtros</h3>
            <div className="flex flex-wrap items-center gap-2">
              {preset !== null && (
                <Button type="button" variant={followsPalette ? "secondary" : "outline"} size="sm" onClick={() => setAuto(true)} aria-pressed={followsPalette}>
                  {followsPalette ? "Ajuste automático da paleta ligado" : "Usar o ajuste automático da paleta"}
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={exportConfig}>
                Exportar filtros
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Importar filtros
              </Button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Arquivo de filtros para importar" onChange={(e) => void importConfig(e.target.files?.[0])} />
            </div>
            <FormMessage error={portable.error} ok={portable.ok} />
          </div>

          <div className="grid gap-4">
            <div role="tablist" aria-label="Tema dos filtros" className="inline-flex w-fit rounded-lg border p-1">
              {THEMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={theme === t}
                  onClick={() => setTheme(t)}
                  className="rounded-md px-4 py-1.5 text-sm leading-normal transition-colors duration-150 ease-out aria-selected:bg-primary aria-selected:text-primary-foreground"
                >
                  Tema {THEME_NAME[t]}
                </button>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <div className="grid content-start gap-4">
                <label className="flex min-h-11 items-center gap-3 text-sm leading-normal">
                  <input type="checkbox" checked={f.invert} onChange={(e) => set({ invert: e.target.checked })} />
                  Inverter as cores (linhas pretas viram brancas)
                </label>
                <div className="grid gap-2">
                  <Label htmlFor="entry-blend">Mistura com o fundo do tema</Label>
                  <Select items={BLENDS.map((b) => ({ value: b, label: BLEND_LABEL[b] }))} value={f.blend} onValueChange={(v) => set({ blend: (v ?? f.blend) as BgFilter["blend"] })}>
                    <SelectTrigger id="entry-blend" className="w-full max-w-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BLENDS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {BLEND_LABEL[b]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {SLIDERS.map((k) => {
                  const r = RANGES[k];
                  return (
                    <div key={k} className="grid gap-1.5">
                      <div className="flex items-center justify-between text-sm leading-normal">
                        <Label htmlFor={`entry-${k}`}>{r.label}</Label>
                        <span className="tabular-nums text-muted-foreground">
                          {f[k]}
                          {r.unit}
                        </span>
                      </div>
                      <input
                        id={`entry-${k}`}
                        type="range"
                        min={r.min}
                        max={r.max}
                        step={r.step}
                        value={f[k]}
                        onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<BgFilter>)}
                        className="h-6 w-full accent-[var(--primary)]"
                      />
                    </div>
                  );
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => {
                    setFilters({ ...effective, [theme]: DEFAULT_FILTERS[theme] });
                    setAuto(false);
                  }}
                >
                  Restaurar filtros do tema {THEME_NAME[theme]}
                </Button>
              </div>

              <div className="grid content-start gap-3">
                <p className="text-sm font-medium">Prévia</p>
                {THEMES.map((t) => (
                  <div key={t} className="grid gap-1.5">
                    <span className="text-xs text-muted-foreground">Tema {THEME_NAME[t]}</span>
                    <div className={`${t === "dark" ? "dark" : ""} relative isolate h-44 overflow-hidden rounded-xl border`} style={{ backgroundColor: backgrounds[t] }}>
                      <EntryBackgroundView bg={live} videoVersion={brand.entryVideoVersion} imageVersion={brand.entryImageVersion} contained theme={t} />
                      <div className="relative z-10 grid h-full place-items-center">
                        <span className="rounded-xl border px-4 py-2 text-sm" style={{ color: t === "dark" ? "#eef4ff" : "#0a1a33", background: t === "dark" ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.6)" }}>
                          Cartão de entrada
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {!ready && <p className="text-xs leading-normal text-muted-foreground">Escolha um pronto ou envie um arquivo para ver a prévia.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        <FormMessage error={state.error} ok={state.ok} />
        <Button type="submit" form={FORM_ID} size="lg" disabled={pending || (mode !== "none" && !ready)} className="w-fit">
          {pending ? "Salvando…" : "Salvar fundo"}
        </Button>
      </div>
    </div>
  );
}
