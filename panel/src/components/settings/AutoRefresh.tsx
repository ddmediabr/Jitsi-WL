"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Atualiza os dados da página a cada `seconds`, só com a aba visível (sem recarregar a tela). */
export default function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
