"use client";

import { useState } from "react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  room: string;
  /** Mensagem de falha do último login (ex.: senha incorreta). */
  error?: string | null;
  onSubmit: (username: string, password: string) => void;
  onCancel: () => void;
};

/**
 * Tela própria de login de usuário cadastrado. A senha só existe na memória desta página
 * e segue para o Prosody; nada é guardado no navegador.
 */
export default function LoginForm({ room, error, onSubmit, onCancel }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const canSubmit = username.trim().length > 0 && password.length > 0;

  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(username.trim(), password);
      }}
    >
      <div className="text-center">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">Sala</p>
        <h1 className="mt-1 text-xl font-semibold">{room}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Entre com a sua conta.</p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="login-user">Usuário</Label>
        <Input
          id="login-user"
          value={username}
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="login-pass">Senha</Label>
        <Input
          id="login-pass"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2">
        <Button type="submit" size="lg" disabled={!canSubmit}>
          Continuar
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          Voltar
        </Button>
      </div>
    </form>
  );
}
