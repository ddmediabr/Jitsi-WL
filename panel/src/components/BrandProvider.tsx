"use client";

import { createContext, useContext, type ReactNode } from "react";
import { EMPTY_ENTRY, type Brand } from "@/lib/brand";

const BrandContext = createContext<Brand>({ name: "", logoDarkVersion: null, logoLightVersion: null, faviconVersion: null, logoDarkRatio: null, logoLightRatio: null, ...EMPTY_ENTRY });

/** Entrega a identidade (nome/logo) a qualquer componente, inclusive os de cliente das telas de entrada. */
export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext);
