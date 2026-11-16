import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/lib/utils";

type Props<T extends ElementType> = { as?: T } & Omit<ComponentPropsWithoutRef<T>, "as">;

/**
 * Cartão de vidro do painel (quase sem cor própria, blur + saturação, borda em degradê fina e luzes
 * internas suaves). O CSS fica em `globals.css` (.glass-card e .glass-card-*). Funciona sobre qualquer
 * fundo; é mais bonito sobre um fundo com cor/luz atrás. Padding, largura e animação ficam a cargo de
 * quem usa (via `className`). O conteúdo fica acima das camadas decorativas.
 */
export default function GlassCard<T extends ElementType = "section">({ as, className, children, ...rest }: Props<T>) {
  const Tag: ElementType = as ?? "section";
  return (
    <Tag className={cn("glass-card", className)} {...rest}>
      <span className="glass-card-ring" aria-hidden="true" />
      <span className="glass-card-top" aria-hidden="true" />
      <span className="glass-card-left" aria-hidden="true" />
      <span className="glass-card-inner" aria-hidden="true" />
      <span className="glass-card-sheen" aria-hidden="true" />
      <div className="relative">{children}</div>
    </Tag>
  );
}
