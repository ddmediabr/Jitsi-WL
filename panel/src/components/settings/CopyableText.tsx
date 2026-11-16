"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Texto com botão de copiar (e selecionável com um clique). `label` descreve o que está sendo copiado. */
export default function CopyableText({ text, label = "o nome" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sem permissão da área de transferência: o usuário ainda pode selecionar o texto */
    }
  }
  return (
    <span className="flex w-fit max-w-full items-center gap-2">
      <code className="min-w-0 rounded-md bg-muted px-2 py-1 font-mono text-sm break-all select-all">{text}</code>
      <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={`Copiar ${label}`}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </span>
  );
}
