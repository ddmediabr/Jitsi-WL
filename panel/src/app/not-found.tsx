import type { Metadata } from "next";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "404 | Conexão perdida", robots: { index: false, follow: false } };

/** 404 dos endereços que o painel serve (a página de sala inexistente é outra: veja RoomUnavailable). Página avulsa, nos dois temas, sem logo. */
export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-10 text-center">
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[min(900px,140vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--primary)_16%,transparent),transparent_68%)]"
        aria-hidden="true"
      />
      <ThemeToggle floating />

      <p
        className="bg-gradient-to-b from-primary to-primary/25 bg-clip-text text-[clamp(120px,24vw,260px)] leading-[0.85] font-extrabold tracking-[-0.06em] text-transparent select-none"
        aria-label="Erro 404"
      >
        404
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/_flow/robot.webp"
        alt=""
        width={500}
        height={500}
        className="nf-float -mt-2 size-[clamp(200px,34vw,320px)] object-contain drop-shadow-[0_14px_28px_color-mix(in_oklch,var(--primary)_30%,transparent)]"
      />
      <h1 className="mt-2 text-[clamp(26px,3.6vw,38px)] leading-tight font-bold tracking-tight text-balance">Oops, conexão perdida!</h1>
      {/* Navegação completa de propósito (o domínio é dividido com o Jitsi; veja README). */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <Button render={<a href="/" />} nativeButton={false} size="lg" className="mt-7">
        Voltar para o início
      </Button>
    </main>
  );
}
