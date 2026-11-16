import type { ReactNode } from "react";
import GlassCard from "@/components/GlassCard";
import BrandMark from "@/components/BrandMark";
import { getBrand } from "@/server/brand/brand";
import { BRAND_DEFAULT, getSetting } from "@/server/settings";

export const DEFAULT_TITLE = "Meet Panel";

/**
 * Moldura das telas públicas do painel (login, primeiro acesso, 2FA, recuperação de senha):
 * cartão de vidro centralizado sobre um fundo escuro com a cor de destaque (`--primary`, padrão #BECB54).
 * Sempre escura (sem seletor de tema), num palco de no máximo 1366 px. Só CSS: sem blur e sem JavaScript de efeito.
 */
export default async function AuthShell({
  title = DEFAULT_TITLE,
  description,
  children,
}: {
  title?: string;
  description: string;
  children: ReactNode;
}) {
  const [brand, savedName] = await Promise.all([getBrand(), getSetting("brand_name")]);
  const hasLogo = brand.logoDarkVersion !== null || brand.logoLightVersion !== null;
  const name = (typeof savedName === "string" && savedName.trim()) || BRAND_DEFAULT;

  return (
    <div className="dark auth-page">
      <div className="auth-stage">
        <div className="auth-bg" aria-hidden="true">
          <div className="auth-glow auth-glow-a" />
          <div className="auth-glow auth-glow-b" />
          <div className="auth-glow auth-glow-c" />
          <div className="auth-film" />
        </div>

        <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <GlassCard className="auth-card animate-in fade-in-0 slide-in-from-bottom-2 w-full max-w-[28.5rem] px-6 py-9 duration-300 ease-[var(--ease-out)] fill-mode-both sm:px-10 sm:py-14">
            <div className="flex flex-col items-center text-center">
              {hasLogo ? (
                <BrandMark imgClassName="h-16 object-center" />
              ) : (
                <span className="max-w-full truncate text-xl font-bold tracking-tight text-primary">{name}</span>
              )}
              <h1 className="mt-4 text-[1.75rem] leading-tight font-bold tracking-tight text-balance text-white">{title}</h1>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{description}</p>
            </div>
            <div className="mt-10">{children}</div>
          </GlassCard>
        </main>
      </div>
    </div>
  );
}
