"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { THEME_COOKIE } from "@/lib/theme";

/**
 * Alterna entre o tema escuro e o claro. A escolha vale para este navegador: fica num cookie que o servidor lê para já
 * desenhar a página no tema certo (sem piscar). Os ícones trocam por CSS (sem estado), então não há diferença entre servidor e navegador.
 */
export default function ThemeToggle({ className, variant = "ghost", floating = false }: { className?: string; variant?: "ghost" | "outline"; /** Botão flutuante no canto inferior direito da janela (páginas sem cabeçalho). */ floating?: boolean }) {
  const toggle = () => {
    const root = document.documentElement;
    const toDark = !root.classList.contains("dark");
    root.classList.toggle("dark", toDark);
    root.style.colorScheme = toDark ? "dark" : "light";
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${THEME_COOKIE}=${toDark ? "dark" : "light"}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  };
  return (
    <Button
      type="button"
      variant={floating ? "outline" : variant}
      size="icon"
      onClick={toggle}
      className={floating ? "fixed right-4 bottom-4 z-40 size-12 rounded-full border-transparent bg-foreground text-background shadow-lg hover:bg-foreground/90 hover:text-background" : className} aria-label="Alternar entre tema claro e escuro" title="Alternar tema">
      <SunIcon className="hidden dark:block" aria-hidden="true" />
      <MoonIcon className="dark:hidden" aria-hidden="true" />
    </Button>
  );
}
