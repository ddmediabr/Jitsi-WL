"use client";

import { useActionState } from "react";
import CopyableText from "@/components/settings/CopyableText";
import FormMessage from "@/components/settings/FormMessage";
import { GeneratedPassword, PasswordChoice } from "@/components/settings/UserForms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changePanelRoleAction,
  createPanelUserAction,
  deletePanelUserAction,
  endPanelSessionsAction,
  resetPanelPasswordAction,
  resetPanelTwoFactorAction,
  type PanelFormState,
} from "@/server/admins/actions";

const initial: PanelFormState = {};

const ROLE_HELP = {
  admin: "Administrador: acessa tudo no painel, exceto Configurações (este menu).",
  owner: "Proprietário: acessa tudo, inclusive Configurações e os usuários do painel.",
} as const;

function RoleChoice({ idPrefix, current }: { idPrefix: string; current?: "owner" | "admin" }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm leading-normal font-medium">Papel</legend>
      {(["admin", "owner"] as const).map((r) => (
        <label key={r} htmlFor={`${idPrefix}-${r}`} className="flex items-start gap-2 text-sm leading-normal">
          <input id={`${idPrefix}-${r}`} type="radio" name="role" value={r} defaultChecked={(current ?? "admin") === r} className="mt-1" />
          <span>{ROLE_HELP[r]}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function CreatePanelUserForm() {
  const [state, action, pending] = useActionState(createPanelUserAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <GeneratedPassword state={state} />
      <div className="grid gap-2">
        <Label htmlFor="panel-name">Nome</Label>
        <Input id="panel-name" name="name" autoComplete="off" required minLength={2} maxLength={80} placeholder="ex.: Maria Silva" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="panel-username">Nome de usuário</Label>
        <Input id="panel-username" name="username" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={32} placeholder="ex.: maria.silva" />
        <p className="text-xs leading-normal text-muted-foreground">De 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="panel-email">E-mail (opcional)</Label>
        <Input id="panel-email" name="email" type="email" autoComplete="off" maxLength={160} placeholder="ex.: maria@empresa.com.br" />
      </div>
      <RoleChoice idPrefix="create-role" />
      <PasswordChoice idPrefix="panel-create" />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Criando…" : "Criar usuário do painel"}
      </Button>
    </form>
  );
}

export function ChangeRoleForm({ username, role }: { username: string; role: "owner" | "admin" }) {
  const [state, action, pending] = useActionState(changePanelRoleAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <input type="hidden" name="username" value={username} />
      <FormMessage error={state.error} ok={state.ok} />
      <RoleChoice idPrefix="change-role" current={role} />
      <Button type="submit" variant="outline" disabled={pending} className="w-fit">
        {pending ? "Salvando…" : "Salvar papel"}
      </Button>
    </form>
  );
}

export function ResetPanelPasswordForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState(resetPanelPasswordAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <input type="hidden" name="username" value={username} />
      <FormMessage error={state.error} ok={state.ok} />
      <GeneratedPassword state={state} />
      <PasswordChoice idPrefix="panel-reset" />
      <Button type="submit" variant="outline" disabled={pending} className="w-fit">
        {pending ? "Redefinindo…" : "Redefinir senha"}
      </Button>
    </form>
  );
}

/** Botão simples de ação sem campos (encerrar sessões, remover 2FA). */
function SimpleAction({
  username,
  action: serverAction,
  label,
  busy,
}: {
  username: string;
  action: (prev: PanelFormState, formData: FormData) => Promise<PanelFormState>;
  label: string;
  busy: string;
}) {
  const [state, action, pending] = useActionState(serverAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-3" noValidate>
      <input type="hidden" name="username" value={username} />
      <FormMessage error={state.error} ok={state.ok} />
      <Button type="submit" variant="outline" disabled={pending} className="w-fit">
        {pending ? busy : label}
      </Button>
    </form>
  );
}

export const EndSessionsForm = ({ username }: { username: string }) => (
  <SimpleAction username={username} action={endPanelSessionsAction} label="Encerrar todas as sessões" busy="Encerrando…" />
);

export const ResetTwoFactorForm = ({ username }: { username: string }) => (
  <SimpleAction username={username} action={resetPanelTwoFactorAction} label="Remover a verificação em duas etapas" busy="Removendo…" />
);

export function DeletePanelUserForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState(deletePanelUserAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <input type="hidden" name="username" value={username} />
      <FormMessage error={state.error} />
      <div className="grid gap-2">
        <Label htmlFor="delete-panel-confirm">Para apagar, digite o nome do usuário:</Label>
        <CopyableText text={username} label="o nome do usuário" />
        <Input id="delete-panel-confirm" name="confirm" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={64} />
      </div>
      <Button type="submit" variant="destructive" disabled={pending} className="w-fit">
        {pending ? "Apagando…" : "Apagar usuário do painel"}
      </Button>
    </form>
  );
}
