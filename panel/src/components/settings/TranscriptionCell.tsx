"use client";

import { useActionState, useState } from "react";
import { DownloadIcon, FileTextIcon, LoaderCircleIcon, MailIcon, SparklesIcon } from "lucide-react";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CASCADE, MAX_ROUNDS, MODEL_LABELS, modelLabel, type Attempt } from "@/lib/transcription";
import { emailTranscriptAction, startTranscriptionAction, type TranscriptionState } from "@/server/transcription/actions";

export type RunInfo = {
  id: string;
  status: "queued" | "processing" | "waiting" | "done" | "failed";
  requested: string | null;
  modelTr: string | null;
  modelAn: string | null;
  created: string;
  took: string;
  tokens: string;
  error: string | null;
  attempts: Attempt[];
  /** Quando a próxima rodada roda (status "waiting"), já formatado. */
  nextRetry: string | null;
};

const ACTIVE: RunInfo["status"][] = ["queued", "processing", "waiting"];
const initial: TranscriptionState = {};

function StartForm({ recordingId, canPickModel, label }: { recordingId: string; canPickModel: boolean; label: string }) {
  const [state, action, pending] = useActionState(startTranscriptionAction, initial);
  return (
    <form action={action} className="grid gap-2" noValidate>
      <input type="hidden" name="id" value={recordingId} />
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex flex-wrap items-end gap-2">
        {canPickModel ? (
          <div className="grid gap-1">
            <Label htmlFor={`tr-model-${recordingId}`} className="text-xs">
              Modelo
            </Label>
            <select
              id={`tr-model-${recordingId}`}
              name="model"
              defaultValue="auto"
              className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="auto" className="bg-popover text-popover-foreground">
                Automático (Padrão)
              </option>
              {CASCADE.map((m) => (
                <option key={m} value={m} className="bg-popover text-popover-foreground">
                  {MODEL_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          <SparklesIcon aria-hidden="true" /> {pending ? "Enviando…" : label}
        </Button>
      </div>
    </form>
  );
}

/** Pede um e-mail e envia um .zip com a transcrição e a análise. */
function EmailForm({ recordingId, runId }: { recordingId: string; runId: string }) {
  const [state, action, pending] = useActionState(emailTranscriptAction, initial);
  return (
    <form action={action} className="grid gap-2" noValidate>
      <input type="hidden" name="id" value={recordingId} />
      <input type="hidden" name="run" value={runId} />
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`send-${runId}`} className="text-xs">
            Enviar para o e-mail
          </Label>
          <Input id={`send-${runId}`} name="email" type="email" autoComplete="off" placeholder="nome@empresa.com" maxLength={254} required className="h-9 w-64 max-w-full" />
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          <MailIcon aria-hidden="true" /> {pending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
    </form>
  );
}

function Downloads({ recordingId, runId }: { recordingId: string; runId: string }) {
  const base = `/settings/gravacoes/${recordingId}/transcricao?execucao=${runId}`;
  const [sending, setSending] = useState(false);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" render={<a href={`${base}&tipo=txt`} download />}>
          <DownloadIcon aria-hidden="true" /> Transcrição (.txt)
        </Button>
        <Button variant="outline" size="sm" render={<a href={`${base}&tipo=docx`} download />}>
          <DownloadIcon aria-hidden="true" /> Análise (.docx)
        </Button>
        <Button variant="outline" size="sm" aria-expanded={sending} onClick={() => setSending((v) => !v)}>
          <MailIcon aria-hidden="true" /> Enviar por e-mail
        </Button>
      </div>
      {sending ? <EmailForm recordingId={recordingId} runId={runId} /> : null}
    </div>
  );
}

/** Tentativas separadas por rodada (cada rodada é uma passada completa pelo failover; entre elas há 1 h de espera). */
function Attempts({ attempts }: { attempts: Attempt[] }) {
  if (attempts.length === 0) return null;
  const groups = new Map<number, Attempt[]>();
  for (const a of attempts) groups.set(a.rodada ?? 1, [...(groups.get(a.rodada ?? 1) ?? []), a]);
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Tentativas ({attempts.length})</summary>
      <div className="mt-2 grid gap-2">
        {[...groups.entries()].map(([rodada, list]) => (
          <div key={rodada} className="grid gap-0.5">
            <p className="font-medium text-foreground">
              Rodada {rodada} de {MAX_ROUNDS}
            </p>
            <ul className="grid gap-0.5">
              {list.map((a, i) => (
                <li key={i}>
                  {a.etapa === "transcricao" ? "Transcrição" : "Análise"} · {modelLabel(a.modelo)} · tentativa {a.tentativa} · {a.ok ? "ok" : `erro (${a.tipo}): ${a.erro}`} · {(a.ms / 1000).toFixed(1)} s
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}

function RunCard({ recordingId, r }: { recordingId: string; r: RunInfo }) {
  return (
    <div className="grid gap-2 rounded-xl border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{r.requested ? modelLabel(r.requested) : "Automático"}</span>
        <span className="text-xs text-muted-foreground">{r.created}</span>
      </div>
      {r.status === "done" ? (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Transcrição: {modelLabel(r.modelTr)} · Análise: {modelLabel(r.modelAn)} · {r.took} · {r.tokens}
          </p>
          <Downloads recordingId={recordingId} runId={r.id} />
        </>
      ) : null}
      {r.status === "failed" && r.error ? <p className="text-xs leading-relaxed text-destructive">{r.error}</p> : null}
      <Attempts attempts={r.attempts} />
    </div>
  );
}

function activeText(r: RunInfo): string {
  if (r.status === "waiting") return r.nextRetry ? `Nova tentativa às ${r.nextRetry}` : "Aguardando nova tentativa";
  return r.status === "processing" ? "Processando…" : "Na fila…";
}

/** Coluna "Transcrição" da lista de gravações: só o botão (Transcrever ou Abrir); o diálogo mostra a situação, os arquivos (aba Pronto) e as falhas (aba Falhou). */
export default function TranscriptionCell({ recordingId, runs, configured, isOwner }: { recordingId: string; runs: RunInfo[]; configured: boolean; isOwner: boolean }) {
  const [tab, setTab] = useState<"done" | "failed">("done");
  const done = runs.filter((r) => r.status === "done");
  const failed = runs.filter((r) => r.status === "failed");
  const running = runs.find((r) => ACTIVE.includes(r.status));
  const shown = tab === "done" ? done : failed;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Dialog>
        <DialogTrigger render={<Button variant="outline" size="sm" aria-label="Abrir transcrição e análise desta gravação" />}>
          <FileTextIcon aria-hidden="true" /> {runs.length ? "Abrir" : "Transcrever"}
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Transcrição e análise</DialogTitle>
          <DialogDescription>Visualize a lista de arquivos das transcrições na íntegra (.txt) e análise da reunião (.docx)</DialogDescription>
          {configured ? (
            running ? (
              <p className="flex items-center gap-2 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-4 shrink-0 animate-spin" aria-hidden="true" /> {activeText(running)}
                {running.status === "waiting" ? ` (rodada ${running.attempts.length ? Math.max(...running.attempts.map((a) => a.rodada ?? 1)) : 1} de ${MAX_ROUNDS} falhou)` : ""}
              </p>
            ) : (
              <StartForm recordingId={recordingId} canPickModel={isOwner} label={runs.length ? "Rodar de novo" : "Transcrever esta gravação"} />
            )
          ) : (
            <p className="text-sm text-muted-foreground">A chave do Gemini não está configurada no servidor.</p>
          )}
          <div role="tablist" aria-label="Resultado das execuções" className="flex gap-1 border-b">
            {(
              [
                ["done", "Pronto", done.length],
                ["failed", "Falhou", failed.length],
              ] as const
            ).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "-mb-px min-h-9 border-b-2 px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label} ({n})
              </button>
            ))}
          </div>
          <div role="tabpanel" className="grid max-h-[50dvh] gap-3 overflow-y-auto">
            {shown.length === 0 ? <p className="text-sm text-muted-foreground">{tab === "done" ? "Nenhuma transcrição pronta." : "Nenhuma falha."}</p> : null}
            {shown.map((r) => (
              <RunCard key={r.id} recordingId={recordingId} r={r} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
