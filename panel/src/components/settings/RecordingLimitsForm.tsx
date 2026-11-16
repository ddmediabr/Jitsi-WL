"use client";

import { useActionState } from "react";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveRecordingLimitsAction, type RecordingLimitsState } from "@/server/recordings/limits";

const initial: RecordingLimitsState = {};

export default function RecordingLimitsForm({ retentionDays, maxGb }: { retentionDays: number; maxGb: number }) {
  const [state, action, pending] = useActionState(saveRecordingLimitsAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-6" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="grid gap-2">
        <Label htmlFor="retentionDays">Retenção (dias)</Label>
        <div className="flex items-center gap-3">
          <Input id="retentionDays" name="retentionDays" type="number" inputMode="numeric" min={1} max={365} step={1} defaultValue={retentionDays} required className="w-28" />
          <span className="text-sm leading-normal text-muted-foreground">dias · de 1 a 365</span>
        </div>
        <p className="text-xs leading-normal text-muted-foreground">Depois desse prazo a gravação é apagada do servidor.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="maxGb">Espaço máximo (GB)</Label>
        <div className="flex items-center gap-3">
          <Input id="maxGb" name="maxGb" type="number" inputMode="numeric" min={1} max={60} step={1} defaultValue={maxGb} required className="w-28" />
          <span className="text-sm leading-normal text-muted-foreground">GB · de 1 a 60</span>
        </div>
        <p className="text-xs leading-normal text-muted-foreground">
          A limpeza começa 5 GB antes deste valor e apaga a gravação mais antiga; os 5 GB finais são só margem para gravações que já estavam em andamento. A gravação nunca é interrompida.
        </p>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Salvando…" : "Salvar limites"}
      </Button>
    </form>
  );
}
