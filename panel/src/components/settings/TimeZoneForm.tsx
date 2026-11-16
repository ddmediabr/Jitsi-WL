"use client";

import { useActionState } from "react";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveTimeZoneAction, type TimeZoneState } from "@/server/timezone-action";

const initial: TimeZoneState = {};
const FIRST = ["America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Cuiaba", "America/Rio_Branco", "America/Noronha", "UTC"];

export default function TimeZoneForm({ current, zones, now }: { current: string; zones: string[]; now: string }) {
  const [state, action, pending] = useActionState(saveTimeZoneAction, initial);
  const rest = zones.filter((z) => !FIRST.includes(z));
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="grid gap-2">
        <Label htmlFor="timezone">Fuso horário</Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={current}
          className="h-9 w-full max-w-sm rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <optgroup label="Mais usados">
            {FIRST.map((z) => (
              <option key={z} value={z} className="bg-popover text-popover-foreground">
                {z}
              </option>
            ))}
          </optgroup>
          <optgroup label="Todos">
            {rest.map((z) => (
              <option key={z} value={z} className="bg-popover text-popover-foreground">
                {z}
              </option>
            ))}
          </optgroup>
        </select>
        <p className="text-xs leading-normal text-muted-foreground">Agora neste fuso: {now}. Vale para auditoria, gravações, salas e para a limpeza diária das 4h.</p>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Salvando…" : "Salvar fuso horário"}
      </Button>
    </form>
  );
}
