import type { ReactNode } from "react";

/**
 * Movimento do produto: SOMENTE CSS (transform e opacidade, na GPU).
 * Regra de ouro: nada de animação em JavaScript, nem blur. O iframe do Jitsi divide a mesma thread
 * desta página, e qualquer coisa competindo com o vídeo da sala é inaceitável.
 * Itens entram com animação; a saída é imediata (animar saída exigiria JavaScript).
 */
const ENTER = "animate-in fade-in-0 duration-200 ease-[var(--ease-out-quart)] fill-mode-both";

/** Botão/selo que aparece: surge de scale 0.9 com opacidade. */
export function Pop({ children }: { children: ReactNode }) {
  return <span className={`${ENTER} zoom-in-90 inline-flex`}>{children}</span>;
}

/** Item de lista: entra deslizando um pouco da direita. */
export function ListItem({ children, className }: { children: ReactNode; className?: string }) {
  return <li className={`${ENTER} slide-in-from-right-3 ${className ?? ""}`}>{children}</li>;
}
