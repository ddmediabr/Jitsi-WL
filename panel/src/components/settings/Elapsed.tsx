"use client";

import { useEffect, useState } from "react";

function format(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Tempo de sessão ativo (mm:ss ou h:mm:ss). O servidor informa quanto tempo já se passou NO MOMENTO da
 * página (`base`, em segundos, calculado no servidor, sem depender do relógio do navegador); daí em
 * diante o navegador só soma os segundos até a próxima atualização.
 */
export default function Elapsed({ base }: { base: number }) {
  const [extra, setExtra] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia a contagem quando o servidor manda um valor novo
    setExtra(0);
    const id = setInterval(() => setExtra(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [base]);
  return (
    <time className="font-mono text-sm tabular-nums text-muted-foreground" aria-label="Tempo de sessão">
      {format(base + extra)}
    </time>
  );
}
