"use client";

import { useActionState, useState, useTransition } from "react";
import CopyableText from "@/components/settings/CopyableText";
import { MAX_IMAGE_BYTES, TOO_BIG_MESSAGE } from "@/lib/brand";
import FilePicker from "@/components/settings/FilePicker";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Reveal from "@/components/settings/Reveal";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  addUserToRoomAction,
  createUserAction,
  deleteUserAction,
  removePhotoAction,
  resetPasswordAction,
  setDisplayNameAction,
  setInvisibleAllowedAction,
  setEmailAction,
  setPhotoAction,
  type UserFormState,
} from "@/server/users/actions";

const initial: UserFormState = {};

/** Escolha entre senha gerada (padrão, recomendada) e digitada. */
export function PasswordChoice({ idPrefix }: { idPrefix: string }) {
  const [mode, setMode] = useState<"generate" | "custom">("generate");
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm leading-normal font-medium">Senha</legend>
      <label className="flex items-center gap-2 text-sm leading-normal">
        <input type="radio" name="mode" value="generate" checked={mode === "generate"} onChange={() => setMode("generate")} />
        Gerar uma senha forte (recomendado)
      </label>
      <label className="flex items-center gap-2 text-sm leading-normal">
        <input type="radio" name="mode" value="custom" checked={mode === "custom"} onChange={() => setMode("custom")} />
        Definir eu mesmo
      </label>
      {mode === "custom" && (
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-password`}>Senha</Label>
          <Input
            id={`${idPrefix}-password`}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
          <p className="text-xs leading-normal text-muted-foreground">
            Pelo menos 12 caracteres, com três tipos entre minúsculas, maiúsculas, números e símbolos.
          </p>
        </div>
      )}
    </fieldset>
  );
}

/** Mostra a senha gerada UMA vez (ela só existe nesta resposta; não é guardada em lugar nenhum). */
export function GeneratedPassword({ state }: { state: UserFormState }) {
  if (!state.password) return null;
  return (
    <div className="grid max-w-xl gap-2 rounded-xl border p-4">
      <p className="text-sm leading-normal font-medium">
        Senha de <span className="font-mono">{state.username}</span>
      </p>
      <CopyableText text={state.password} label="a senha" />
      <p className="text-xs leading-normal text-muted-foreground">
        Entregue a senha por um canal seguro. Ela não poderá ser vista depois; se perder, redefina.
      </p>
    </div>
  );
}

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <GeneratedPassword state={state} />
      <div className="grid gap-2">
        <Label htmlFor="user-display-name">Nome</Label>
        <Input id="user-display-name" name="displayName" autoComplete="off" required minLength={2} maxLength={60} placeholder="ex.: Maria Silva" />
        <p className="text-xs leading-normal text-muted-foreground">Nome mostrado nas listas do painel.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="user-name">Nome de usuário</Label>
        <Input id="user-name" name="username" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={64} placeholder="ex.: maria.silva" />
        <p className="text-xs leading-normal text-muted-foreground">Letras minúsculas, números, ponto, hífen ou sublinhado.</p>
      </div>
      <PasswordChoice idPrefix="create" />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Criando…" : "Criar conta"}
      </Button>
    </form>
  );
}

export function DisplayNameForm({ username, initialName }: { username: string; initialName: string }) {
  const [state, action, pending] = useActionState(setDisplayNameAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <input type="hidden" name="username" value={username} />
      <FormMessage error={state.error} ok={state.ok} />
      <div className="grid gap-2">
        <Label htmlFor="display-name">Nome</Label>
        <Input id="display-name" name="displayName" defaultValue={initialName} autoComplete="off" required minLength={2} maxLength={60} />
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="w-fit">
        {pending ? "Salvando…" : "Salvar nome"}
      </Button>
    </form>
  );
}

/** Foto de perfil da conta, trocada pelo painel (sem limite de trocas). Mesmas regras de segurança do upload do usuário. */
export function PhotoForm({ username, photoUrl }: { username: string; photoUrl: string | null }) {
  // Confere o tamanho no navegador antes de enviar (o Next recusa corpos grandes com uma página de erro genérica).
  const guarded = async (prev: UserFormState, formData: FormData): Promise<UserFormState> => {
    const file = formData.get("photo");
    if (file instanceof File && file.size > MAX_IMAGE_BYTES) return { error: TOO_BIG_MESSAGE };
    return setPhotoAction(prev, formData);
  };
  const [state, action, pending] = useActionState(guarded, initial);
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={`Foto de ${username}`} width={96} height={96} className="size-24 rounded-full border object-cover" />
        ) : (
          <div className="grid size-24 place-items-center rounded-full border text-xs text-muted-foreground" aria-label="Sem foto">
            Sem foto
          </div>
        )}
        <form action={action} className="grid max-w-none gap-3" noValidate>
          <input type="hidden" name="username" value={username} />
          <FormMessage error={state.error} ok={state.ok} />
          <div className="grid gap-2">
            <Label htmlFor="photo-file">Nova foto</Label>
            <FilePicker id="photo-file" name="photo" accept="image/jpeg,image/png,image/tiff,image/webp" />
            <p className="text-xs leading-normal text-muted-foreground">JPG, PNG, TIFF ou WebP, até 2 MB. Substitui a foto atual.</p>
          </div>
          <Button type="submit" variant="outline" disabled={pending} className="w-fit">
            {pending ? "Enviando…" : "Enviar foto"}
          </Button>
        </form>
      </div>
      {photoUrl && (
        <form action={removePhotoAction}>
          <input type="hidden" name="username" value={username} />
          <Button type="submit" variant="ghost" className="w-fit">
            Remover foto
          </Button>
        </form>
      )}
    </div>
  );
}

export function ResetPasswordForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <input type="hidden" name="username" value={username} />
      <FormMessage error={state.error} ok={state.ok} />
      <GeneratedPassword state={state} />
      <PasswordChoice idPrefix="reset" />
      <Button type="submit" variant="outline" disabled={pending} className="w-fit">
        {pending ? "Redefinindo…" : "Redefinir senha"}
      </Button>
    </form>
  );
}

export function DeleteUserForm({ username }: { username: string }) {
  const [state, action, pending] = useActionState(deleteUserAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <input type="hidden" name="username" value={username} />
      <FormMessage error={state.error} />
      <div className="grid gap-2">
        <Label htmlFor="delete-user-confirm">Para apagar, digite o nome do usuário:</Label>
        <CopyableText text={username} label="o nome do usuário" />
        <Input id="delete-user-confirm" name="confirm" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={64} />
      </div>
      <Button type="submit" variant="destructive" disabled={pending} className="w-fit">
        {pending ? "Apagando…" : "Apagar conta"}
      </Button>
    </form>
  );
}

/** Dá à conta acesso a uma das salas ainda não vinculadas, sem sair da página. */
export function AddToRoomForm({ username, available }: { username: string; available: string[] }) {
  const [state, action, pending] = useActionState(addUserToRoomAction, initial);
  const [picked, setRoom] = useState("");
  // Depois de incluir, a sala sai da lista: a seleção antiga deixa de valer.
  const room = available.includes(picked) ? picked : "";
  if (available.length === 0) {
    return <p className="text-xs leading-normal text-muted-foreground">Não há outras salas disponíveis para incluir.</p>;
  }
  return (
    <div className="mt-4 grid gap-4">
      <h3 className="text-base leading-snug font-semibold">Dar acesso a uma sala</h3>
      <form action={action} className="grid max-w-none" noValidate>
        <input type="hidden" name="username" value={username} />
        <input type="hidden" name="room" value={room} />
        {(state.error || state.ok) && (
          <div className="mb-4">
            <FormMessage error={state.error} ok={state.ok} />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="add-room">Sala</Label>
          <Select items={available.map((r) => ({ value: r, label: `/${r}` }))} value={room || null} onValueChange={(v) => setRoom(v ?? "")}>
            <SelectTrigger id="add-room" className="w-full min-w-0 max-w-xl font-mono">
              <SelectValue placeholder="Selecione uma sala" />
            </SelectTrigger>
            <SelectContent>
              {available.map((r) => (
                <SelectItem key={r} value={r} className="font-mono">
                  /{r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Reveal show={room !== ""}>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm leading-normal font-medium">Permissão na sala</legend>
            <label className="flex items-center gap-2 text-sm leading-normal">
              <input type="radio" name="role" value="member" defaultChecked />
              Usuário comum (entra direto, sem privilégios de moderação)
            </label>
            <label className="flex items-center gap-2 text-sm leading-normal">
              <input type="radio" name="role" value="moderator" />
              Moderador (entra direto, com privilégios de moderação)
            </label>
          </fieldset>
          <Button type="submit" disabled={pending || !room} className="w-fit">
            {pending ? "Concedendo…" : "Dar acesso"}
          </Button>
        </Reveal>
      </form>
    </div>
  );
}

/** Modo invisível da conta (liga/desliga na hora). */
export function InvisibleSwitch({ username, initialValue }: { username: string; initialValue: boolean }) {
  const [checked, setChecked] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-3">
      <Switch
        id="invisible-allowed"
        checked={checked}
        disabled={pending}
        onCheckedChange={(value) => {
          setChecked(value);
          const fd = new FormData();
          fd.set("username", username);
          fd.set("invisible", value ? "on" : "off");
          startTransition(() => setInvisibleAllowedAction(fd));
        }}
      />
      <Label htmlFor="invisible-allowed">Modo invisível {checked ? "(ligado)" : "(desligado)"}</Label>
    </div>
  );
}

/** E-mail opcional da conta: recebe o link de download das gravações que ela iniciar. */
export function EmailForm({ username, initialEmail }: { username: string; initialEmail: string }) {
  const [state, action, pending] = useActionState(setEmailAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <input type="hidden" name="username" value={username} />
      <FormMessage error={state.error} ok={state.ok} />
      <div className="grid gap-2">
        <Label htmlFor="account-email">E-mail (opcional)</Label>
        <Input id="account-email" name="email" type="email" defaultValue={initialEmail} autoComplete="off" maxLength={254} placeholder="nome@empresa.com" />
        <p className="text-xs leading-normal text-muted-foreground">Sem e-mail, a pessoa não recebe o link das gravações; elas continuam disponíveis no painel.</p>
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="w-fit">
        {pending ? "Salvando…" : "Salvar e-mail"}
      </Button>
    </form>
  );
}
