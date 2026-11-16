"use client";

import { useActionState, useState } from "react";
import RoomIcon from "@/components/hall/RoomIcon";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HALL_SUBTITLE_MAX, HALL_TITLE_MAX, ROOM_DESCRIPTION_MAX, ROOM_ICON_KEYS, ROOM_ICON_LABEL, type RoomIconKey } from "@/lib/hall";
import { EXIT_TEXT_MAX, EXIT_TITLE_MAX, type ExitTexts } from "@/lib/exit-texts";
import { saveExitTextsAction, saveHallTextAction, saveRoomCardAction, type HallFormState } from "@/server/hall/actions";

const initial: HallFormState = {};
const AREA =
  "min-h-24 w-full max-w-xl resize-y rounded-xl border border-input bg-[#f6f9fd] px-3.5 py-2.5 text-base leading-relaxed transition-colors outline-none placeholder:text-faint focus-visible:border-primary md:text-sm dark:bg-white/[0.045]";

const Counter = ({ value, max }: { value: string; max: number }) => (
  <span className="text-xs tabular-nums text-muted-foreground">
    {value.length}/{max}
  </span>
);

/** Título e subtítulo da página de entrada, com contador de caracteres. */
export function HallTextForm({ title, subtitle }: { title: string; subtitle: string }) {
  const [state, action, pending] = useActionState(saveHallTextAction, initial);
  const [t, setT] = useState(title);
  const [s, setS] = useState(subtitle);
  return (
    <form action={action} className="grid max-w-none gap-5" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="grid gap-2">
        <div className="flex max-w-xl items-center justify-between gap-3">
          <Label htmlFor="hall-title">Título</Label>
          <Counter value={t} max={HALL_TITLE_MAX} />
        </div>
        <Input id="hall-title" name="title" value={t} maxLength={HALL_TITLE_MAX} autoComplete="off" onChange={(e) => setT(e.target.value)} />
        <p className="text-xs leading-normal text-muted-foreground">A última palavra aparece na cor de destaque. Vazio volta para &ldquo;Meeting Hall&rdquo;.</p>
      </div>
      <div className="grid gap-2">
        <div className="flex max-w-xl items-center justify-between gap-3">
          <Label htmlFor="hall-subtitle">Texto abaixo do título</Label>
          <Counter value={s} max={HALL_SUBTITLE_MAX} />
        </div>
        <textarea id="hall-subtitle" name="subtitle" value={s} maxLength={HALL_SUBTITLE_MAX} rows={3} className={AREA} onChange={(e) => setS(e.target.value)} />
        <p className="text-xs leading-normal text-muted-foreground">Até {HALL_SUBTITLE_MAX} caracteres (cerca de 3 linhas). Vazio não mostra texto.</p>
      </div>
      <Button type="submit" size="lg" disabled={pending} className="w-fit">
        {pending ? "Salvando…" : "Salvar textos"}
      </Button>
    </form>
  );
}

/** Ícone e texto do cartão da sala na página de entrada. O contorno do ícone é sempre redondo; só o desenho interno troca. */
export function RoomCardForm({
  room,
  icon,
  description,
  defaultIcon,
  defaultDescription,
}: {
  room: string;
  icon: RoomIconKey | null;
  description: string;
  defaultIcon: RoomIconKey;
  defaultDescription: string;
}) {
  const [state, action, pending] = useActionState(saveRoomCardAction, initial);
  const [chosen, setChosen] = useState<RoomIconKey | "">(icon ?? "");
  const [text, setText] = useState(description);
  return (
    <form action={action} className="grid max-w-none gap-5" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <input type="hidden" name="room" value={room} />
      <input type="hidden" name="icon" value={chosen} />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm leading-normal font-medium">Ícone</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={chosen === ""}
            onClick={() => setChosen("")}
            className="flex h-12 items-center gap-2 rounded-full border px-4 text-sm outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-accent"
          >
            <RoomIcon icon={defaultIcon} className="size-5 text-primary" /> Padrão
          </button>
          {ROOM_ICON_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              title={ROOM_ICON_LABEL[k]}
              aria-label={ROOM_ICON_LABEL[k]}
              aria-pressed={chosen === k}
              onClick={() => setChosen(k)}
              className="grid size-12 place-items-center rounded-full border text-primary outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-accent"
            >
              <RoomIcon icon={k} className="size-5" />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2">
        <div className="flex max-w-xl items-center justify-between gap-3">
          <Label htmlFor="room-description">Texto do cartão</Label>
          <Counter value={text} max={ROOM_DESCRIPTION_MAX} />
        </div>
        <textarea id="room-description" name="description" value={text} maxLength={ROOM_DESCRIPTION_MAX} rows={3} className={AREA} placeholder={defaultDescription} onChange={(e) => setText(e.target.value)} />
        <p className="text-xs leading-normal text-muted-foreground">
          Até {ROOM_DESCRIPTION_MAX} caracteres (cerca de 3 linhas). Vazio usa o texto padrão do acesso (em cinza no campo).
        </p>
      </div>
      <Button type="submit" size="lg" disabled={pending} className="w-fit">
        {pending ? "Salvando…" : "Salvar cartão"}
      </Button>
    </form>
  );
}

/** Textos da página de saída: um bloco para "saiu ou desconectou" e outro para "removido". */
export function ExitTextsForm({ texts }: { texts: ExitTexts }) {
  const [state, action, pending] = useActionState(saveExitTextsAction, initial);
  const [v, setV] = useState(texts);
  const set = (patch: Partial<ExitTexts>) => setV((cur) => ({ ...cur, ...patch }));
  const block = (title: string, titleKey: "leftTitle" | "kickedTitle" | "endedTitle", textKey: "leftText" | "kickedText" | "endedText", hint: string) => (
    <fieldset className="grid gap-4 rounded-xl border p-4">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <p className="text-xs leading-normal text-muted-foreground">{hint}</p>
      <div className="grid gap-2">
        <div className="flex max-w-xl items-center justify-between gap-3">
          <Label htmlFor={`exit-${titleKey}`}>Título</Label>
          <Counter value={v[titleKey]} max={EXIT_TITLE_MAX} />
        </div>
        <Input id={`exit-${titleKey}`} name={titleKey} value={v[titleKey]} maxLength={EXIT_TITLE_MAX} autoComplete="off" onChange={(e) => set({ [titleKey]: e.target.value })} />
      </div>
      <div className="grid gap-2">
        <div className="flex max-w-xl items-center justify-between gap-3">
          <Label htmlFor={`exit-${textKey}`}>Texto</Label>
          <Counter value={v[textKey]} max={EXIT_TEXT_MAX} />
        </div>
        <textarea id={`exit-${textKey}`} name={textKey} value={v[textKey]} maxLength={EXIT_TEXT_MAX} rows={3} className={AREA} onChange={(e) => set({ [textKey]: e.target.value })} />
      </div>
    </fieldset>
  );
  return (
    <form action={action} className="grid max-w-none gap-5" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      {block("Saiu ou foi desconectado", "leftTitle", "leftText", "Aparece com o botão para voltar à sala e a lista de salas recentes.")}
      {block("Foi removido por um moderador", "kickedTitle", "kickedText", "Aparece sem botão de volta à sala e sem a lista de salas recentes.")}
      {block("A reunião foi encerrada para todos", "endedTitle", "endedText", "Fim da reunião e agradecimento: não tem botão; volta sozinho para a página de entrada em 6 segundos.")}
      <p className="text-xs leading-normal text-muted-foreground">Até {EXIT_TEXT_MAX} caracteres por texto (cerca de 3 linhas). Vazio volta ao texto padrão.</p>
      <Button type="submit" size="lg" disabled={pending} className="w-fit">
        {pending ? "Salvando…" : "Salvar textos"}
      </Button>
    </form>
  );
}
