"use client";

import { useActionState, useEffect } from "react";
import { CheckIcon } from "lucide-react";
import FormMessage from "@/components/settings/FormMessage";
import { PALETTES, paletteTokens, type PaletteId } from "@/lib/palette";
import { savePaletteAction, type AccentState } from "@/server/theme/actions";

const initial: AccentState = {};

/** Escolha da paleta dos temas: cada opção mostra o fundo e a cor de destaque dos dois temas lado a lado. */
export default function PaletteForm({ current }: { current: PaletteId }) {
  const [state, action, pending] = useActionState(savePaletteAction, initial);
  // O <style> da paleta leva o nonce da CSP da requisição que o gerou. Depois da ação, o servidor devolve um nonce novo, que não vale para a página
  // já aberta: o navegador bloquearia o estilo. Recarregar traz a página e o estilo com o mesmo nonce.
  useEffect(() => {
    if (state.ok) window.location.reload();
  }, [state]);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <div role="group" aria-label="Paleta dos temas" className="grid grid-cols-[repeat(auto-fill,minmax(min(170px,100%),1fr))] gap-3">
        {PALETTES.map((p) => {
          const dark = paletteTokens(p.id, "dark");
          const light = paletteTokens(p.id, "light");
          const active = p.id === current;
          return (
            <button
              key={p.id}
              type="submit"
              name="palette"
              value={p.id}
              disabled={pending}
              aria-pressed={active}
              className="grid gap-3 rounded-2xl border p-3 text-left outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 aria-pressed:border-primary aria-pressed:bg-accent"
            >
              <span className="flex h-14 overflow-hidden rounded-xl border" aria-hidden="true">
                <span className="flex flex-1 items-end p-2" style={{ background: dark.background }}>
                  <span className="h-3 w-full rounded-full" style={{ background: dark["accent-color"] }} />
                </span>
                <span className="flex flex-1 items-end p-2" style={{ background: light.background }}>
                  <span className="h-3 w-full rounded-full" style={{ background: light["accent-color"] }} />
                </span>
              </span>
              <span className="flex items-center justify-between gap-2 text-sm font-medium">
                {p.label}
                {active && <CheckIcon className="size-4 text-primary" aria-label="Paleta atual" />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-normal text-muted-foreground">
        Troca fundos, superfícies e destaque dos dois temas. Ao escolher, as cores de destaque ajustadas à mão são limpas.
      </p>
    </form>
  );
}
