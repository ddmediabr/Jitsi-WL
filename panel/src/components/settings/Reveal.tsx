import type { ReactNode } from "react";

/**
 * Mostra/oculta um bloco com entrada e saída suaves, só com CSS (altura via grid + opacidade). Oculto,
 * o conteúdo fica inerte: não recebe foco nem aparece para leitores de tela.
 */
export default function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div
      inert={!show}
      aria-hidden={!show}
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${show ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
    >
      <div className="-mx-1 min-h-0 overflow-hidden px-1">
        <div className="grid gap-4 pt-4 pb-1">{children}</div>
      </div>
    </div>
  );
}
