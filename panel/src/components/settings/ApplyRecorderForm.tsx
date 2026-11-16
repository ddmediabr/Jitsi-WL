"use client";

import { useActionState } from "react";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { restartRecorderAction, type RestartState } from "@/server/recordings/restart-action";

const initial: RestartState = {};

/** "Aplicar agora": reinicia o gravador com a qualidade salva. Pede a senha de novo. */
export default function ApplyRecorderForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(restartRecorderAction, initial);
  if (!configured) {
    return (
      <p className="max-w-[800px] text-xs leading-relaxed text-muted-foreground">
        Para aplicar sem abrir o Coolify, o painel precisa de um token de reinício (variáveis COOLIFY_API_TOKEN e COOLIFY_JIBRI_SERVICE_UUID). Enquanto isso, a nova qualidade vale quando o serviço do gravador for reiniciado.
      </p>
    );
  }
  return (
    <form action={action} className="grid max-w-md gap-3 rounded-xl border p-4" noValidate>
      <h3 className="text-sm leading-snug font-semibold">Aplicar agora no gravador</h3>
      <p className="text-xs leading-normal text-muted-foreground">Reinicia o gravador (cerca de 1 a 2 minutos sem poder gravar). Salve a qualidade antes. O servidor de reuniões não é afetado.</p>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="grid gap-2">
        <Label htmlFor="restart-password">Sua senha</Label>
        <Input id="restart-password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.needsForce ? (
        <label className="flex items-start gap-3 text-sm leading-normal">
          <input type="checkbox" name="force" className="mt-1" />
          <span>Reiniciar mesmo assim (pode cortar a gravação em andamento)</span>
        </label>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending} className="w-fit">
        {pending ? "Reiniciando…" : "Aplicar agora"}
      </Button>
    </form>
  );
}
