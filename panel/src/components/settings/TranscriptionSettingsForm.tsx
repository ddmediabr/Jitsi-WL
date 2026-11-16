"use client";

import { useActionState } from "react";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CASCADE, MODEL_LABELS } from "@/lib/transcription";
import { saveTranscriptionSettingsAction, type TranscriptionState } from "@/server/transcription/actions";

const initial: TranscriptionState = {};

export default function TranscriptionSettingsForm({ glossary, keyConfigured }: { glossary: string; keyConfigured: boolean }) {
  const [state, action, pending] = useActionState(saveTranscriptionSettingsAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-5" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      {!keyConfigured ? (
        <p className="max-w-[800px] rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-relaxed">
          A chave do Gemini (<span className="font-mono">GEMINI_API_KEY</span>) não está configurada no servidor: a transcrição fica desligada até ela existir.
        </p>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="glossary">Glossário (opcional)</Label>
        <textarea
          id="glossary"
          name="glossary"
          defaultValue={glossary}
          rows={5}
          maxLength={3000}
          placeholder={"Um termo por linha, por exemplo:\nJitsi\nNome de produto ou cliente\nSigla interna (significado)"}
          className="w-full max-w-xl rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p className="text-xs leading-normal text-muted-foreground">Nomes próprios, siglas e termos técnicos que a IA deve escrever do jeito certo.</p>
      </div>
      <div className="grid gap-1 text-xs leading-relaxed text-muted-foreground">
        <p className="font-medium text-foreground">Ordem dos modelos (failover automático)</p>
        <ol className="list-decimal pl-5">
          {CASCADE.map((m) => (
            <li key={m}>{MODEL_LABELS[m]}</li>
          ))}
        </ol>
        <p>Se um modelo falhar, o próximo assume. Plano pago do Gemini: o conteúdo não é usado para treinar modelos.</p>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  );
}
