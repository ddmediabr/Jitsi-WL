import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { getBrand } from "@/server/brand/brand";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return { title: `Painel | ${brand.name}`, robots: { index: false, follow: false } };
}

/**
 * Todas as telas do painel são dinâmicas (CSP com nonce por requisição, sessão por cookie).
 * Ler os cabeçalhos aqui garante isso.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await headers();
  // `data-panel`: o CSS global mantém a barra de rolagem sempre visível nas telas do painel (a página não "pula" de largura).
  return <div data-panel>{children}</div>;
}
