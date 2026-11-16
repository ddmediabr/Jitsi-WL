"use client";

import type { ReactNode } from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Botão "+ Novo ..." alinhado à direita que abre um modal com o formulário de criação. */
export default function NewItemDialog({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <Dialog>
        <DialogTrigger render={<Button />}>
          <PlusIcon aria-hidden="true" /> {label}
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>{title}</DialogTitle>
          {children}
        </DialogContent>
      </Dialog>
    </div>
  );
}
