"use client";

import { useActionState } from "react";
import { resetPasswordWithTokenAction, type FormState } from "@/server/auth/actions";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/settings/PasswordInput";
import { Label } from "@/components/ui/label";

const initial: FormState = {};

export default function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordWithTokenAction, initial);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage error={state.error} />
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-2">
        <Label htmlFor="next">Nova senha</Label>
        <PasswordInput id="next" name="next" autoComplete="new-password" required minLength={12} maxLength={128} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm">Repita a senha</Label>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required maxLength={128} />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Salvando…" : "Redefinir senha"}
      </Button>
    </form>
  );
}
