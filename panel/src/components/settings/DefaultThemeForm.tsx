"use client";

import { useActionState } from "react";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import type { ThemeChoice } from "@/lib/theme";
import { saveDefaultThemeAction, type AccentState } from "@/server/theme/actions";

const initial: AccentState = {};

/** Tema para quem ainda não escolheu o seu: o botão de tema de cada pessoa sempre vale mais. */
export default function DefaultThemeForm({ current }: { current: ThemeChoice }) {
  const [state, action, pending] = useActionState(saveDefaultThemeAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <div role="group" aria-label="Tema padrão" className="flex flex-wrap gap-2">
        {(["dark", "light"] as const).map((t) => (
          <Button key={t} type="submit" name="theme" value={t} variant={current === t ? "default" : "outline"} disabled={pending} aria-pressed={current === t}>
            {t === "dark" ? "Escuro" : "Claro"}
          </Button>
        ))}
      </div>
      <p className="text-xs leading-normal text-muted-foreground">
        Vale para quem ainda não escolheu. A escolha de cada pessoa fica guardada no navegador.
      </p>
    </form>
  );
}
