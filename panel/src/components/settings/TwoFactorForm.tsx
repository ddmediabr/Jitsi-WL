"use client";

import { useActionState, useState } from "react";
import { backupCodeAction, emailCodeAction, sendEmailCodeAction, totpAction, type FormState } from "@/server/auth/actions";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: FormState = {};
type Mode = "totp" | "email" | "backup";

/** Segundo passo do login: código do aplicativo autenticador, código enviado por e-mail (se o envio estiver configurado) ou código de recuperação. */
export default function TwoFactorForm({ emailAvailable = false }: { emailAvailable?: boolean }) {
  const [mode, setMode] = useState<Mode>("totp");
  const [totpState, totp, totpPending] = useActionState(totpAction, initial);
  const [emailState, emailVerify, emailPending] = useActionState(emailCodeAction, initial);
  const [backupState, backup, backupPending] = useActionState(backupCodeAction, initial);
  // O envio não é um formulário de verdade (não tem campo): guarda o resultado à mão.
  const [sendState, setSendState] = useState<FormState>({});
  const [sending, setSending] = useState(false);

  const state = mode === "totp" ? totpState : mode === "email" ? emailState : backupState;
  const action = mode === "totp" ? totp : mode === "email" ? emailVerify : backup;
  const pending = totpPending || emailPending || backupPending;

  const sendCode = async () => {
    setSending(true);
    try {
      setSendState(await sendEmailCodeAction());
    } finally {
      setSending(false);
    }
  };
  const choose = (m: Mode) => {
    setMode(m);
    setSendState({});
  };

  return (
    <div className="grid gap-4">
      {mode === "email" && (
        <div className="grid gap-3">
          <FormMessage error={sendState.error} ok={sendState.ok} />
          <Button type="button" variant="outline" onClick={sendCode} disabled={sending}>
            {sending ? "Enviando…" : sendState.ok ? "Enviar um novo código" : "Enviar código por e-mail"}
          </Button>
        </div>
      )}
      <form action={action} className="grid gap-4" noValidate>
        <FormMessage error={state.error} />
        <div className="grid gap-2">
          <Label htmlFor="code">{mode === "backup" ? "Código de recuperação" : mode === "email" ? "Código recebido por e-mail" : "Código de 6 dígitos"}</Label>
          <Input
            key={mode}
            id="code"
            name="code"
            autoComplete="one-time-code"
            inputMode={mode === "backup" ? "text" : "numeric"}
            pattern={mode === "backup" ? undefined : "[0-9]*"}
            maxLength={mode === "backup" ? 24 : 7}
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus={mode !== "email"}
          />
        </div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Verificando…" : "Verificar"}
        </Button>
      </form>
      <div className="grid gap-1">
        {mode !== "totp" && (
          <Button type="button" variant="ghost" onClick={() => choose("totp")}>
            Usar o aplicativo autenticador
          </Button>
        )}
        {emailAvailable && mode !== "email" && (
          <Button type="button" variant="ghost" onClick={() => choose("email")}>
            Receber um código por e-mail
          </Button>
        )}
        {mode !== "backup" && (
          <Button type="button" variant="ghost" onClick={() => choose("backup")}>
            Usar um código de recuperação
          </Button>
        )}
      </div>
    </div>
  );
}
