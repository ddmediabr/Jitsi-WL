"use client";

import { useActionState } from "react";
import { disableTwoFactorAction, type FormState } from "@/server/auth/actions";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: FormState = {};

export default function DisableTwoFactorForm() {
  const [state, action, pending] = useActionState(disableTwoFactorAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <FormMessage error={state.error} />
      <div className="grid gap-2">
        <Label htmlFor="disable-password">Confirme a sua senha para desativar</Label>
        <Input id="disable-password" name="password" type="password" autoComplete="current-password" required maxLength={256} />
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="w-fit">
        {pending ? "Desativando…" : "Desativar verificação em duas etapas"}
      </Button>
    </form>
  );
}
