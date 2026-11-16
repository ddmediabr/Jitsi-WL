"use client";

import { useState, type ComponentProps } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Campo de senha com o olho para mostrar/ocultar (como nas telas públicas do painel). */
export default function PasswordInput(props: Omit<ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className="pr-11" />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={shown}
        className="absolute top-1/2 right-3 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-white/55 outline-none transition-colors hover:text-white focus-visible:text-white"
      >
        {shown ? <EyeOffIcon className="size-[1.15rem]" aria-hidden="true" /> : <EyeIcon className="size-[1.15rem]" aria-hidden="true" />}
      </button>
    </div>
  );
}
