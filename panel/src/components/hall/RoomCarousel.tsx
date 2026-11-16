"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import RoomIcon from "@/components/hall/RoomIcon";
import type { RoomIconKey } from "@/lib/hall";
import { Button } from "@/components/ui/button";

export type HallRoom = {
  name: string;
  title: string;
  description: string;
  status: string;
  icon: RoomIconKey;
};

const PER_PAGE = 6;

/** Salas do painel em páginas de até 6: rolagem horizontal com encaixe (funciona com toque, teclado e setas), pontos e botões de página. */
export default function RoomCarousel({ rooms }: { rooms: HallRoom[] }) {
  const pages: HallRoom[][] = [];
  for (let i = 0; i < rooms.length; i += PER_PAGE) pages.push(rooms.slice(i, i + PER_PAGE));

  const track = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);

  const go = useCallback((to: number) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: to * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  }, []);

  if (rooms.length === 0) {
    return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma sala disponível no momento.</p>;
  }

  return (
    <div role="region" aria-roledescription="carrossel" aria-label="Salas de reunião" className="grid gap-5">
      <div ref={track} className="flex snap-x snap-mandatory overflow-x-auto pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {pages.map((items, p) => (
          <div key={p} role="group" aria-roledescription="página" aria-label={`Página ${p + 1} de ${pages.length}`} className="grid w-full shrink-0 snap-start grid-cols-1 content-start gap-4 px-1 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((room, i) => {
              return (
                <article
                  key={room.name}
                  className="flex min-h-64 flex-col rounded-2xl border bg-card p-6 transition-colors duration-200 hover:border-primary/50"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-semibold tracking-[0.12em] text-primary tabular-nums">{String(p * PER_PAGE + i + 1).padStart(2, "0")}</span>
                    <span className="grid size-11 place-items-center rounded-full border border-primary/30 bg-primary/10 text-primary">
                      <RoomIcon icon={room.icon} className="size-5" />
                    </span>
                  </div>
                  <div className="mt-5 mb-8">
                    <h3 className="truncate text-xl font-semibold tracking-tight">{room.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{room.description}</p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <i className="size-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" aria-hidden="true" />
                      {room.status}
                    </span>
                    {/* Navegação completa de propósito (o domínio é dividido com o Jitsi; veja README: roteamento por "documento"). */}
                    <Button
                      render={<a href={`/${encodeURIComponent(room.name)}`} aria-label={`Entrar na sala ${room.title}`} />}
                      nativeButton={false}
                      className="gap-2 transition-[gap] duration-200 hover:gap-3"
                    >
                      Entrar na sala <ArrowRightIcon className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        ))}
      </div>

      {pages.length > 1 && (
        <div className="flex items-center justify-center gap-4">
          <Button type="button" variant="outline" size="icon" aria-label="Página anterior" disabled={page === 0} onClick={() => go(page - 1)}>
            <ChevronLeftIcon className="size-4" />
          </Button>
          <div className="flex items-center gap-1" role="group" aria-label="Escolher página">
            {pages.map((_, p) => (
              <button
                key={p}
                type="button"
                aria-label={`Ir para a página ${p + 1}`}
                aria-current={p === page ? "true" : undefined}
                onClick={() => go(p)}
                className="grid size-8 place-items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className={`h-2 rounded-full transition-[width,background-color] duration-200 ${p === page ? "w-6 bg-primary" : "w-2 bg-foreground/25"}`} />
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" size="icon" aria-label="Próxima página" disabled={page === pages.length - 1} onClick={() => go(page + 1)}>
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
