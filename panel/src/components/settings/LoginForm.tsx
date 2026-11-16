"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type FormState } from "@/server/auth/actions";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import PasswordInput from "@/components/settings/PasswordInput";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: FormState = {};

export default function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage error={state.error} ok={state.error ? undefined : notice} />
      <div className="grid gap-2">
        <Label htmlFor="username">Usuário</Label>
        <Input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={32} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Senha</Label>
        <PasswordInput id="password" name="password" autoComplete="current-password" required maxLength={256} />
      </div>
      <div className="-mt-1 flex justify-end">
        <Link href="/settings/forgot-password" className="auth-link">
          Esqueci minha senha
        </Link>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
