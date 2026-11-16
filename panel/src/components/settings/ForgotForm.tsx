"use client";

import { useActionState } from "react";
import { forgotPasswordAction, type FormState } from "@/server/auth/actions";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: FormState = {};

export default function ForgotForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, initial);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" required maxLength={160} />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Enviando…" : "Enviar link"}
      </Button>
    </form>
  );
}
