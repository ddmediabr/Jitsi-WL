"use client";

import { useActionState } from "react";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveTimingsAction, type TimingsState } from "@/server/rooms/timings";

const initial: TimingsState = {};

export default function TimingsForm({ reconnectMinutes, rememberHours }: { reconnectMinutes: number; rememberHours: number }) {
  const [state, action, pending] = useActionState(saveTimingsAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-6" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="grid gap-2">
        <Label htmlFor="reconnectMinutes">Passe de reconexão (minutos)</Label>
        <div className="flex items-center gap-3">
          <Input id="reconnectMinutes" name="reconnectMinutes" type="number" inputMode="numeric" min={1} max={1440} step={1} defaultValue={reconnectMinutes} required className="w-28" />
          <span className="text-sm leading-normal text-muted-foreground">minutos · de 1 a 1440</span>
        </div>
        <p className="text-xs leading-normal text-muted-foreground">
          Quando um usuário sem acesso livre sai da sala ele poderá voltar sem nova aprovação durante o tempo definido acima, exceto quando
          expulso da sala.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="rememberHours">Duração da sessão para cadastrados (horas)</Label>
        <div className="flex items-center gap-3">
          <Input id="rememberHours" name="rememberHours" type="number" inputMode="numeric" min={1} max={168} step={1} defaultValue={rememberHours} required className="w-28" />
          <span className="text-sm leading-normal text-muted-foreground">horas · de 1 a 168</span>
        </div>
        <p className="text-xs leading-normal text-muted-foreground">
          Quanto tempo uma conta cadastrada pode retomar a sessão sem digitar a senha de novo.
        </p>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Salvando…" : "Salvar prazos"}
      </Button>
    </form>
  );
}
