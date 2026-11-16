"use client";

import { brandUrl } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { useBrand } from "@/components/BrandProvider";

/**
 * Logo da marca; sem nenhum logo, o nome. Há um logo para cada tema: o do tema atual aparece (a troca é por CSS, na hora, sem
 * piscar). Se só um dos dois foi enviado, ele serve para os dois temas. (Imagens públicas já reprocessadas pelo servidor.)
 */
export default function BrandMark({ className, imgClassName }: { className?: string; imgClassName?: string }) {
  const brand = useBrand();
  const dark = brand.logoDarkVersion ?? brand.logoLightVersion;
  const light = brand.logoLightVersion ?? brand.logoDarkVersion;
  if (dark !== null && light !== null) {
    const base = cn("h-8 w-auto max-w-56 object-contain object-left", imgClassName);
    const darkKind = brand.logoDarkVersion !== null ? "logo_dark" : "logo_light";
    const lightKind = brand.logoLightVersion !== null ? "logo_light" : "logo_dark";
    return (
      <>
        {/* eslint-disable @next/next/no-img-element */}
        <img src={brandUrl(darkKind, dark)} alt={brand.name} className={cn(base, "hidden dark:block")} />
        <img src={brandUrl(lightKind, light)} alt={brand.name} className={cn(base, "block dark:hidden")} />
        {/* eslint-enable @next/next/no-img-element */}
      </>
    );
  }
  if (!brand.name) return null;
  return <span className={cn("truncate text-sm leading-normal font-semibold", className)}>{brand.name}</span>;
}
