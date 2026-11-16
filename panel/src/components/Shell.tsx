import type { ReactNode } from "react";
import BrandMark from "@/components/BrandMark";
import EntryBackground from "@/components/EntryBackground";
import ThemeToggle from "@/components/ThemeToggle";
import GlassCard from "@/components/GlassCard";

/**
 * Moldura centralizada das telas do fluxo (uma única vez, em vez de repetir em cada tela).
 * Entrada: sobe 8 px e aparece com escala 0.97 -> 1, 200 ms, curva forte (guia do Emil Kowalski).
 * Use `key` diferente a cada etapa para a animação rodar de novo na troca de tela.
 */
export default function Shell({
  children,
  background = true,
  lite = false,
}: {
  children: ReactNode;
  /** Fundo em vídeo/imagem de Personalização > Entrada na sala. A página inicial desliga. */
  background?: boolean;
  /** Vidro "leve": desfoque menor, com um tom de fundo para a leitura. Usado na etapa com a prévia da câmera (dois vídeos tocando), onde o vidro completo gerava faixas piscantes. */
  lite?: boolean;
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      {background && <EntryBackground />}
      <ThemeToggle floating />
      {/* Telas de entrada da sala (com fundo): o logo fica DENTRO do cartão. Na página inicial, fica acima dele. */}
      {!background && (
        <div className="relative z-10">
          <BrandMark className="text-base" imgClassName="h-14 object-center" />
        </div>
      )}
      <GlassCard className={`animate-in fade-in-0 zoom-in-97 slide-in-from-bottom-2 relative z-10 w-full max-w-md p-6 duration-200 ease-[var(--ease-out)] fill-mode-both${lite ? " glass-card-lite" : ""}`}>
        {background && (
          <div className="mb-5 flex justify-center">
            <BrandMark className="text-base" imgClassName="h-14 object-center" />
          </div>
        )}
        {children}
      </GlassCard>
    </main>
  );
}
