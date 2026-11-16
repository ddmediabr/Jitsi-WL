"use client";

import { useState } from "react";

/**
 * Campo de envio de arquivo do painel: dentro do campo só "Escolha o arquivo"; abaixo, o nome do arquivo escolhido
 * (ou "Nenhum arquivo escolhido"). O input de verdade fica escondido dentro do rótulo, então teclado e leitor de tela funcionam.
 */
export default function FilePicker({ id, name, accept, required = true }: { id: string; name: string; accept: string; required?: boolean }) {
  const [fileName, setFileName] = useState("");
  return (
    <>
      <label
        htmlFor={id}
        className="flex h-10 w-fit min-w-44 max-w-full cursor-pointer items-center justify-center rounded-[10px] border border-input bg-[#f6f9fd] px-4 text-sm font-medium transition-colors has-[:focus-visible]:border-primary dark:bg-white/[0.045]"
      >
        Escolha o arquivo
        <input id={id} name={name} type="file" className="sr-only" accept={accept} required={required} onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")} />
      </label>
      <p className="max-w-none! text-xs leading-normal break-all text-muted-foreground">{fileName || "Nenhum arquivo escolhido"}</p>
    </>
  );
}
