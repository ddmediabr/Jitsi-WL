"use client";

import { useActionState, useState } from "react";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { maxConcurrent, QUALITIES, QUALITY_ORDER, type RecordingQuality } from "@/lib/recording-quality";
import { saveRecordingQualityAction, type QualityState } from "@/server/recordings/quality-action";

const initial: QualityState = {};

export default function RecordingQualityForm({ quality, dedicated }: { quality: RecordingQuality; dedicated: boolean }) {
  const [state, action, pending] = useActionState(saveRecordingQualityAction, initial);
  const [ded, setDed] = useState(dedicated);
  const [q, setQ] = useState<RecordingQuality>(quality);
  const blocked = QUALITIES[q].needsDedicated && !ded;
  return (
    <form action={action} className="grid max-w-none gap-6" noValidate>
      <FormMessage error={state.error} ok={state.ok} />

      <label className="flex min-h-11 items-start gap-3 text-sm leading-normal">
        <input type="checkbox" name="dedicated" checked={ded} onChange={(e) => setDed(e.target.checked)} className="mt-1" />
        <span>
          <span className="font-medium">O Jibri roda em servidor dedicado (recursos próprios)</span>
          <span className="block text-xs text-muted-foreground">Libera a qualidade 1080p e aumenta o limite de gravações simultâneas. Deixe desmarcado se o gravador divide o servidor com o Jitsi e o painel.</span>
        </span>
      </label>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm leading-normal font-medium">Qualidade da gravação</legend>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Qualidade</th>
                <th className="px-4 py-2 font-medium">CPU por gravação (estimada)</th>
                <th className="px-4 py-2 font-medium">Gravações simultâneas (estimadas)</th>
              </tr>
            </thead>
            <tbody>
              {QUALITY_ORDER.map((key) => {
                const info = QUALITIES[key];
                const off = info.needsDedicated && !ded;
                const limit = maxConcurrent(key, ded);
                return (
                  <tr key={key} className={off ? "border-b opacity-50 last:border-0" : "border-b last:border-0"}>
                    <td className="px-4 py-2.5">
                      <label className="flex min-h-9 items-center gap-3">
                        <input type="radio" name="quality" value={key} checked={q === key} disabled={off} onChange={() => setQ(key)} />
                        {info.label}
                        {off ? <span className="text-xs text-muted-foreground">(só com servidor dedicado)</span> : null}
                      </label>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">~{info.cores.toLocaleString("pt-BR")} núcleo(s)</td>
                    <td className="px-4 py-2.5 tabular-nums">{off ? "—" : limit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-normal text-muted-foreground">
          Os números são estimativas (base: uma gravação de 720p mediu ~0,8 núcleo no servidor atual, de 4 núcleos); o custo cresce com a quantidade de pixels. O limite real também depende de quantos gravadores
          (Jibri) estão instalados: cada gravação simultânea precisa de uma instância própria.
        </p>
      </fieldset>

      {blocked ? <Label className="text-amber-600 dark:text-amber-400">Marque “servidor dedicado” para usar 1080p.</Label> : null}
      <Button type="submit" disabled={pending || blocked} className="w-fit">
        {pending ? "Salvando…" : "Salvar qualidade"}
      </Button>
    </form>
  );
}
