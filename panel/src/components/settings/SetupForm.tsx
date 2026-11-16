"use client";

import { useActionState } from "react";
import { setupAction, type FormState } from "@/server/auth/actions";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/settings/PasswordInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: FormState = {};

export default function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, initial);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage error={state.error} />
      <div className="grid gap-2">
        <Label htmlFor="token">Token de configuração</Label>
        <Input id="token" name="token" type="password" autoComplete="off" required maxLength={256} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" autoComplete="name" required maxLength={80} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required maxLength={160} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="username">Usuário</Label>
        <Input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={32} />
        <p className="text-xs leading-normal text-muted-foreground">3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Senha (mínimo 12 caracteres)</Label>
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm">Repita a senha</Label>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required maxLength={128} />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Criando…" : "Criar administrador"}
      </Button>
    </form>
  );
}
