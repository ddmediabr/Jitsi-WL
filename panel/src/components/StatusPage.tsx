import type { ReactNode } from "react";
import BrandMark from "@/components/BrandMark";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * Página avulsa de status (sala não encontrada, saída da reunião, removido da sala, fim da reunião), sem o cartão de vidro.
 * Padrão: logo acima do título, texto e ações à esquerda e a animação à direita (no celular, a animação sobe e o texto fica centralizado).
 * `centered`: tudo centralizado na página, em coluna (logo, título, texto, animação e, por fim, as ações).
 */
export default function StatusPage({
  title,
  titleIcon,
  text,
  scene,
  centered = false,
  children,
}: {
  title: string;
  /** Ícone ao lado do título (opcional). */
  titleIcon?: ReactNode;
  text: string;
  scene: ReactNode;
  centered?: boolean;
  children?: ReactNode;
}) {
  const heading = (
    <h1 className="flex flex-wrap items-center gap-x-3 text-[clamp(32px,4.4vw,52px)] leading-[1.05] font-extrabold tracking-[-0.04em] text-balance max-lg:justify-center">
      {title}
      {titleIcon}
    </h1>
  );
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute -top-24 -left-40 -z-10 size-[620px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary)_14%,transparent),transparent_70%)]"
        aria-hidden="true"
      />
      <ThemeToggle floating />

      {centered ? (
        <section className="mx-auto flex w-[min(900px,calc(100%-40px))] flex-1 flex-col items-center justify-center gap-6 py-10 text-center">
          <BrandMark className="text-base" imgClassName="h-14 object-center" />
          <div className="grid justify-items-center gap-4">
            {heading}
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">{text}</p>
          </div>
          <div className="w-full max-w-[640px]">{scene}</div>
          {children}
        </section>
      ) : (
        <section className="mx-auto grid w-[min(1200px,calc(100%-40px))] flex-1 items-center gap-8 py-12 md:w-[min(1200px,calc(100%-80px))] lg:grid-cols-[1fr_1.15fr] lg:gap-12">
          <div className="max-w-xl max-lg:mx-auto max-lg:text-center">
            <BrandMark className="text-base" imgClassName="mb-6 h-14 object-left max-lg:object-center" />
            {heading}
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{text}</p>
            {children}
          </div>
          <div className="mx-auto w-full max-w-[760px] max-lg:order-first">{scene}</div>
        </section>
      )}
    </main>
  );
}
