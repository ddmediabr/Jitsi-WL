"use client";

import Link from "next/link";
import { useState } from "react";
import { ShieldAlertIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Tarja inferior mostrada só no primeiro acesso à conta, quando o 2FA ainda não está ativo. */
export default function SecurityTip() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div role="region" aria-label="Proteja o seu acesso" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-3 px-6 py-3">
        <ShieldAlertIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm leading-normal">
          <span className="font-medium">Proteja o seu acesso.</span>{" "}
          <span className="text-muted-foreground">A verificação em duas etapas é recomendada: uma senha vazada não basta.</span>
        </p>
        <Button size="sm" render={<Link href="/settings/security/2fa" />}>
          Ativar agora
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Dispensar aviso" onClick={() => setOpen(false)}>
          <XIcon />
        </Button>
      </div>
    </div>
  );
}
