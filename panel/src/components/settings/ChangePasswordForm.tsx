"use client";

import { useActionState } from "react";
import { changePasswordAction, type FormState } from "@/server/auth/actions";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: FormState = {};

export default function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="grid gap-2">
        <Label htmlFor="current">Senha atual</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required maxLength={256} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="next">Nova senha (mínimo 12 caracteres)</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm">Repita a nova senha</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required maxLength={128} />
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Alterando…" : "Alterar senha"}
      </Button>
    </form>
  );
}
