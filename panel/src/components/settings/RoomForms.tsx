"use client";

import { useActionState, useState, useTransition } from "react";
import { PlusIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  addAccessAction,
  createRoomAction,
  deleteRoomAction,
  makePermanentAction,
  setExclusiveAction,
  setLobbyAction,
  setPasswordAction,
  setStarterAction,
  updateTemporaryAction,
  type FormState,
} from "@/server/rooms/actions";
import { DEFAULT_TTL, TTL_PRESETS } from "@/lib/temporary-rooms";
import { Switch } from "@/components/ui/switch";
import CopyableText from "@/components/settings/CopyableText";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Reveal from "@/components/settings/Reveal";

const initial: FormState = {};

/** Prazo de existência de uma sala temporária; o valor segue em campo oculto. */
function TemporaryFields({ keepOption = false }: { keepOption?: boolean }) {
  const [ttl, setTtl] = useState<string>(keepOption ? "keep" : DEFAULT_TTL);
  const ttlItems = [...(keepOption ? [{ value: "keep", label: "Escolha o novo prazo" }] : []), ...TTL_PRESETS.map((p) => ({ value: p.id, label: p.label }))];
  return (
    <div className="grid max-w-sm gap-2">
      <input type="hidden" name="ttl" value={ttl === "keep" ? "" : ttl} />
      <Label htmlFor="temp-ttl">{keepOption ? "Novo prazo de existência" : "Prazo de existência"}</Label>
      <Select items={ttlItems} value={ttl} onValueChange={(v) => setTtl(v ?? ttl)}>
        <SelectTrigger id="temp-ttl" className="w-full min-w-0 max-w-xl">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ttlItems.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs leading-normal text-muted-foreground">
        {keepOption ? "Conta a partir de agora. " : ""}Passado o prazo, a sala é apagada e o endereço dela deixa de levar a qualquer lugar. Uma reunião em
        andamento não é cortada: a sala some quando ela acabar.
      </p>
    </div>
  );
}

export function CreateRoomForm() {
  const [state, action, pending] = useActionState(createRoomAction, initial);
  const [kind, setKind] = useState<"permanent" | "temporary">("permanent");
  return (
    <form action={action} className="grid max-w-none gap-6" noValidate>
      <FormMessage error={state.error} />
      <div className="grid gap-6">
        <div className="grid content-start gap-2">
          <Label htmlFor="room-name">Nome da sala</Label>
          <Input id="room-name" name="name" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={64} placeholder="ex.: atendimento" className="max-w-none" />
          <p className="text-xs leading-normal text-muted-foreground">
            Vira o endereço <span className="font-mono">/nome</span>. Letras minúsculas, números, hífen ou sublinhado.
          </p>
        </div>
        <fieldset className="grid content-start gap-0">
          <legend className="mb-1 text-sm leading-normal font-medium">Tipo de sala</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm leading-normal">
            <input type="radio" name="kind" value="permanent" checked={kind === "permanent"} onChange={() => setKind("permanent")} />
            Permanente (existe até você apagar)
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm leading-normal">
            <input type="radio" name="kind" value="temporary" checked={kind === "temporary"} onChange={() => setKind("temporary")} />
            Temporária (some sozinha quando o prazo acaba)
          </label>
        </fieldset>
      </div>
      <Reveal show={kind === "temporary"}>
        <TemporaryFields />
      </Reveal>
      <Button type="submit" size="lg" disabled={pending} className="w-fit">
        <PlusIcon aria-hidden="true" /> {pending ? "Criando…" : "Criar sala"}
      </Button>
    </form>
  );
}

/** Ajuste de uma sala temporária já criada: novo prazo e conversão em permanente. */
export function TemporaryRoomForm({ room }: { room: string }) {
  const [state, action, pending] = useActionState(updateTemporaryAction, initial);
  return (
    <div className="grid gap-4">
      <form action={action} className="grid max-w-none gap-4" noValidate>
        <input type="hidden" name="room" value={room} />
        {(state.error || state.ok) && <FormMessage error={state.error} ok={state.ok} />}
        <TemporaryFields keepOption />
        <Button type="submit" variant="outline" disabled={pending} className="w-fit">
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </form>
      <form action={makePermanentAction}>
        <input type="hidden" name="room" value={room} />
        <Button type="submit" variant="ghost" className="w-fit">
          Tornar permanente
        </Button>
      </form>
    </div>
  );
}

/**
 * `available`: contas Jitsi que ainda não moderam esta sala. `null` = o servidor não respondeu
 * (cai para digitação manual).
 */
export function AddAccessForm({ room, available }: { room: string; available: { username: string; name: string | null }[] | null }) {
  const [state, action, pending] = useActionState(addAccessAction, initial);
  const [picked, setUsername] = useState("");
  const list = available ?? [];
  const labelOf = (u: { username: string; name: string | null }) => (u.name ? `${u.name} [${u.username}]` : u.username);
  // Depois de adicionar, a conta sai da lista: a seleção antiga deixa de valer.
  const username = list.some((u) => u.username === picked) ? picked : "";
  const useList = available !== null && list.length > 0;
  // Com a lista, permissão e botão só aparecem depois de escolher uma conta; digitando, ficam sempre.
  const showRest = !useList || username !== "";
  return (
    <div className="mt-4 grid gap-4">
      <h3 className="text-base leading-snug font-semibold">Adicionar usuário</h3>
      <form action={action} className="grid max-w-none" noValidate>
        <input type="hidden" name="room" value={room} />
        {(state.error || state.ok) && (
          <div className="mb-4">
            <FormMessage error={state.error} ok={state.ok} />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="moderator-username">Usuário Jitsi</Label>
          {useList ? (
            <>
              <input type="hidden" name="username" value={username} />
              <Select items={list.map((u) => ({ value: u.username, label: labelOf(u) }))} value={username || null} onValueChange={(v) => setUsername(v ?? "")}>
                <SelectTrigger id="moderator-username" className="w-full min-w-0 max-w-xl">
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
                <SelectContent>
                  {list.map((u) => (
                    <SelectItem key={u.username} value={u.username}>
                      {labelOf(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-normal text-muted-foreground">Contas que ainda não têm acesso a esta sala.</p>
            </>
          ) : (
            <>
              <Input id="moderator-username" name="username" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={64} />
              <p className="text-xs leading-normal text-muted-foreground">
                {available === null
                  ? "Não foi possível listar as contas agora; digite o usuário."
                  : "Sem outras contas disponíveis. Digite o usuário, se for criado depois."}
              </p>
            </>
          )}
        </div>
        <Reveal show={showRest}>
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
          <Button type="submit" disabled={pending || (useList && !username)} className="w-fit">
            {pending ? "Adicionando…" : "Dar acesso"}
          </Button>
        </Reveal>
      </form>
    </div>
  );
}

export function DeleteRoomForm({ room }: { room: string }) {
  const [state, action, pending] = useActionState(deleteRoomAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <input type="hidden" name="room" value={room} />
      <FormMessage error={state.error} />
      <div className="grid gap-2">
        <Label htmlFor="delete-confirm">Para apagar, digite o nome da sala:</Label>
        <CopyableText text={room} />
        <Input id="delete-confirm" name="confirm" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={64} />
      </div>
      <Button type="submit" variant="destructive" disabled={pending} className="w-fit">
        {pending ? "Apagando…" : "Apagar sala"}
      </Button>
    </form>
  );
}

/** Interruptor de controle de acesso da sala (lobby / sala exclusiva). Aplica na hora. */
export function AccessSwitch({
  room,
  field,
  initialValue,
  label,
}: {
  room: string;
  field: "exclusive" | "lobby" | "password";
  initialValue: boolean;
  label: string;
}) {
  const [checked, setChecked] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  const id = `room-${field}`;
  return (
    <div className="flex items-center gap-3">
      <Switch
        id={id}
        checked={checked}
        disabled={pending}
        onCheckedChange={(value) => {
          setChecked(value);
          const fd = new FormData();
          fd.set("room", room);
          fd.set(field, value ? "on" : "off");
          startTransition(() => (field === "lobby" ? setLobbyAction(fd) : field === "password" ? setPasswordAction(fd) : setExclusiveAction(fd)));
        }}
      />
      <Label htmlFor={id}>
        {label} {checked ? "(ligado)" : "(desligado)"}
      </Label>
    </div>
  );
}

/** Direito de iniciar a reunião sozinho (só para usuário comum). Não dá privilégios de moderação. */
export function StarterSwitch({ room, username, initialValue }: { room: string; username: string; initialValue: boolean }) {
  const [checked, setChecked] = useState(initialValue);
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      aria-label={`${username} é moderador interino`}
      checked={checked}
      disabled={pending}
      onCheckedChange={(value) => {
        setChecked(value);
        const fd = new FormData();
        fd.set("room", room);
        fd.set("username", username);
        fd.set("canStart", value ? "on" : "off");
        startTransition(() => setStarterAction(fd));
      }}
    />
  );
}
