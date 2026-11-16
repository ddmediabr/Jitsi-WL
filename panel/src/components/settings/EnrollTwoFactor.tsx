"use client";

import { useActionState } from "react";
import {
  confirmTwoFactorAction,
  startTwoFactorAction,
  type FormState,
  type TwoFactorStart,
} from "@/server/auth/actions";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const startInitial: TwoFactorStart = {};
const confirmInitial: FormState = {};

/** Cadastro obrigatório da verificação em duas etapas (TOTP) + códigos de recuperação. */
export default function EnrollTwoFactor() {
  const [start, startAction, starting] = useActionState(startTwoFactorAction, startInitial);
  const [confirm, confirmAction, confirming] = useActionState(confirmTwoFactorAction, confirmInitial);

  if (!start.qr) {
    return (
      <form action={startAction} className="grid gap-4" noValidate>
        <FormMessage error={start.error} />
        <div className="grid gap-2">
          <Label htmlFor="password">Confirme a sua senha para começar</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256} />
        </div>
        <Button type="submit" size="lg" disabled={starting}>
          {starting ? "Gerando…" : "Gerar código QR"}
        </Button>
      </form>
    );
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-4">
        <h2 className="text-base leading-snug font-semibold">1. Leia o código no aplicativo autenticador</h2>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerada no servidor */}
        <img src={start.qr} alt="Código QR para o aplicativo autenticador" width={224} height={224} className="rounded-lg bg-white p-2" />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Sem câmera? Digite esta chave no aplicativo:{" "}
          <code className="rounded bg-muted px-2 py-1 font-mono text-xs break-all text-foreground">{start.secret}</code>
        </p>
      </section>

      <section className="grid gap-4">
        <h2 className="text-base leading-snug font-semibold">2. Guarde os códigos de recuperação</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Cada código vale uma vez e só aparece agora. Sem o aplicativo, são a única forma de entrar.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-4 font-mono text-sm">
          {start.backupCodes?.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      <form action={confirmAction} className="grid gap-4" noValidate>
        <h2 className="text-base leading-snug font-semibold">3. Confirme com um código do aplicativo</h2>
        <FormMessage error={confirm.error} />
        <div className="grid gap-2">
          <Label htmlFor="code">Código de 6 dígitos</Label>
          <Input id="code" name="code" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={7} required />
        </div>
        <Button type="submit" size="lg" disabled={confirming}>
          {confirming ? "Verificando…" : "Ativar verificação em duas etapas"}
        </Button>
      </form>
    </div>
  );
}
