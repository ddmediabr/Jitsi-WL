"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Atualização da visão geral: a cada `seconds` (só com a aba visível) ou na hora, pelo botão. Mostra
 * quanto falta para a próxima. Cada atualização é UMA consulta ao servidor de reuniões.
 */
export default function RefreshBar({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);
  const [pending, startTransition] = useTransition();
  const leftRef = useRef(seconds);

  const refreshNow = () => {
    leftRef.current = seconds;
    setLeft(seconds);
    startTransition(() => router.refresh());
  };

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return; // aba escondida: congela a contagem
      leftRef.current -= 1;
      if (leftRef.current <= 0) {
        leftRef.current = seconds;
        setLeft(seconds);
        startTransition(() => router.refresh());
      } else {
        setLeft(leftRef.current);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [router, seconds]);

  return (
    <div className="flex items-center gap-2 text-sm leading-normal text-muted-foreground">
      <span aria-live="off">
        {pending ? "Atualizando…" : `Próxima atualização em ${left} s`}
      </span>
      <Button type="button" variant="outline" size="icon" aria-label="Atualizar agora" title="Atualizar agora" onClick={refreshNow} disabled={pending}>
        <RefreshCwIcon className={pending ? "animate-spin motion-reduce:animate-none" : ""} />
      </Button>
    </div>
  );
}
