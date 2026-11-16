"use client";

import { Children, useRef, useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const PER_SCREEN = 6;

/**
 * Carrossel dos cards de sala: no máximo 6 por tela (3 x 2 em tela larga). A troca de tela é rolagem
 * horizontal com encaixe (CSS: scroll-snap), sem JavaScript de animação; os botões e os pontos só
 * rolam até a tela pedida. Usa o deslocamento real da rolagem, então funciona também com o dedo.
 */
export default function RoomCarousel({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  const screens: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += PER_SCREEN) screens.push(items.slice(i, i + PER_SCREEN));

  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = (to: number) => {
    const el = track.current;
    if (!el) return;
    const target = Math.max(0, Math.min(screens.length - 1, to));
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="grid gap-4">
      <div
        ref={track}
        role="group"
        aria-roledescription="carrossel"
        aria-label="Salas"
        onScroll={(e) => {
          const el = e.currentTarget;
          const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (next !== index) setIndex(next);
        }}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
      >
        {screens.map((screen, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="tela"
            aria-label={`Tela ${i + 1} de ${screens.length}`}
            className="grid w-full shrink-0 snap-start grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] content-start gap-4 p-1"
          >
            {screen}
          </div>
        ))}
      </div>
      {screens.length > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button type="button" variant="outline" size="icon-sm" aria-label="Tela anterior" disabled={index <= 0} onClick={() => go(index - 1)}>
            <ChevronLeftIcon />
          </Button>
          <div className="flex items-center gap-2">
            {screens.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir para a tela ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={`size-2 rounded-full transition-colors duration-200 ${i === index ? "bg-primary" : "bg-muted-foreground/40"}`}
              />
            ))}
          </div>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Próxima tela" disabled={index >= screens.length - 1} onClick={() => go(index + 1)}>
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </div>
  );
}
