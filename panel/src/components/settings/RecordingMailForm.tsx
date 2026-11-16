"use client";

import { useActionState } from "react";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAIL_DEFAULTS, MAIL_LIMITS, MAIL_VARS, type MailField } from "@/lib/mail-template";
import { saveRecordingMailAction, type MailFormState } from "@/server/recordings/mail-actions";

const initial: MailFormState = {};
const AREA =
  "w-full max-w-xl rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Editor do modelo do e-mail da gravação. Campo vazio = texto padrão (aparece como dica no campo). */
export default function RecordingMailForm({ saved }: { saved: Record<MailField, string> }) {
  const [state, action, pending] = useActionState(saveRecordingMailAction, initial);
  const line = (id: MailField, label: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`mail-${id}`}>{label}</Label>
      <Input id={`mail-${id}`} name={id} defaultValue={saved[id]} placeholder={MAIL_DEFAULTS[id]} maxLength={MAIL_LIMITS[id]} className="max-w-xl" />
    </div>
  );
  const area = (id: MailField, label: string, rows: number) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`mail-${id}`}>{label}</Label>
      <textarea id={`mail-${id}`} name={id} defaultValue={saved[id]} placeholder={MAIL_DEFAULTS[id]} rows={rows} maxLength={MAIL_LIMITS[id]} className={AREA} />
    </div>
  );
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
        Deixe um campo vazio para usar o texto padrão. Nos textos, use as variáveis abaixo entre chaves duplas; elas são trocadas pelos dados de cada gravação.
      </p>
      <ul className="flex max-w-[800px] flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {MAIL_VARS.map((v) => (
          <li key={v.name}>
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">{`{{${v.name}}}`}</code> {v.help}
          </li>
        ))}
      </ul>
      {line("subject", "Assunto")}
      {line("title", "Título")}
      {area("intro", "Mensagem", 3)}
      {line("button", "Texto do botão")}
      {area("transcript_ok", "Aviso quando a transcrição vai em anexo", 2)}
      {area("transcript_failed", "Aviso quando a transcrição não pôde ser gerada", 2)}
      {area("footer", "Rodapé", 2)}
      <div className="grid gap-1.5">
        <Label htmlFor="mail-color">Cor do cabeçalho e do botão, em todos os e-mails (#RRGGBB)</Label>
        <Input id="mail-color" name="color" defaultValue={saved.color} placeholder="Vazio = cor de destaque do painel" maxLength={7} className="max-w-xs font-mono" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="save" disabled={pending} className="w-fit">
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="submit" name="intent" value="reset" variant="outline" disabled={pending} className="w-fit">
          Restaurar padrão
        </Button>
      </div>
    </form>
  );
}
