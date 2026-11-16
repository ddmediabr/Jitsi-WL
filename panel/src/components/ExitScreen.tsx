"use client";

import { useEffect, useState } from "react";
import { ArrowRightIcon, PartyPopperIcon } from "lucide-react";
import { useBrand } from "@/components/BrandProvider";
import ExitSceneEnded from "@/components/ExitSceneEnded";
import ExitSceneKicked from "@/components/ExitSceneKicked";
import ExitSceneLeft from "@/components/ExitSceneLeft";
import StatusPage from "@/components/StatusPage";
import { Button } from "@/components/ui/button";
import { goHome } from "@/lib/nav";
import { readRecentRooms } from "@/lib/recent-rooms";

export type ExitReason = "left" | "kicked" | "ended";

/** Fim da reunião: tempo até voltar sozinho para a página de entrada. */
const REDIRECT_MS = 6000;

/** Salas recentes que ainda existem (a lista guardada no navegador pode ter salas apagadas ou temporárias vencidas). */
async function liveRecents(current: string): Promise<string[]> {
  const names = readRecentRooms().filter((r) => r !== current).slice(0, 4);
  const checked = await Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(`/flow-api/room-info?room=${encodeURIComponent(name)}`, { cache: "no-store" });
        const info = (await res.json()) as { exists?: boolean; expired?: boolean };
        return info.exists === true && info.expired !== true ? name : null;
      } catch {
        return null;
      }
    }),
  );
  return checked.filter((n): n is string => n !== null);
}

/**
 * Página de saída da reunião, no mesmo layout da "sala não encontrada" (animação própria de cada caso): saiu ou foi desconectado (voltar à sala e
 * salas recentes), removido por um moderador e fim da reunião (só o caminho para a página de entrada). Textos em Personalização > Página de saída.
 */
export default function ExitScreen({ reason, room, onReturn }: { reason: ExitReason; room: string; onReturn: () => void }) {
  const { exit } = useBrand();
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    if (reason !== "left") return;
    let alive = true;
    void liveRecents(room).then((list) => {
      if (alive) setRecents(list);
    });
    return () => {
      alive = false;
    };
  }, [reason, room]);

  const kicked = reason === "kicked";
  const ended = reason === "ended";
  const title = ended ? exit.endedTitle : kicked ? exit.kickedTitle : exit.leftTitle;
  const text = ended ? exit.endedText : kicked ? exit.kickedText : exit.leftText;
  // Fim da reunião: sem botão, volta sozinho para a página de entrada depois de alguns segundos.
  useEffect(() => {
    if (reason !== "ended") return;
    const timer = window.setTimeout(goHome, REDIRECT_MS);
    return () => window.clearTimeout(timer);
  }, [reason]);

  if (reason === "ended") {
    return (
      <StatusPage centered title={title} titleIcon={<PartyPopperIcon className="size-[0.9em] shrink-0 overflow-visible text-primary" aria-hidden="true" />} text={text} scene={<ExitSceneEnded className="h-auto w-full" />}>
        <p className="sr-only" role="status">
          Você será levado à página de entrada em instantes.
        </p>
      </StatusPage>
    );
  }

  return (
    <StatusPage title={title} text={text} scene={reason === "left" ? <ExitSceneLeft className="h-auto w-full" /> : <ExitSceneKicked className="h-auto w-full" />}>
      <div className="mt-8 flex flex-wrap gap-3 max-lg:justify-center">
        {reason === "left" ? (
          <>
            <Button size="lg" onClick={onReturn}>
              Voltar à sala <strong className="font-semibold">{room}</strong>
            </Button>
            <Button size="lg" variant="outline" onClick={goHome}>
              Encerrar e voltar ao início
            </Button>
          </>
        ) : (
          <Button size="lg" onClick={goHome}>
            Voltar ao início
          </Button>
        )}
      </div>
      {reason === "left" && recents.length > 0 && (
        <section className="mt-8" aria-label="Salas recentes">
          <h2 className="text-xs tracking-widest text-muted-foreground uppercase">Salas recentes</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {recents.map((name) => (
              <li key={name}>
                <a
                  href={`/${encodeURIComponent(name)}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-card px-4 text-sm outline-none transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="truncate">{name}</span>
                  <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </StatusPage>
  );
}
