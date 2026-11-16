"use client";

import { useActionState } from "react";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveShareFpsAction, type ShareState } from "@/server/share-action";

const initial: ShareState = {};
const OPTIONS = [5, 10, 15, 20, 30];

export default function ShareForm({ fps }: { fps: number }) {
  const [state, action, pending] = useActionState(saveShareFpsAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-4" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="grid gap-2">
        <Label htmlFor="share-fps">Quadros por segundo</Label>
        <select
          id="share-fps"
          name="fps"
          defaultValue={fps}
          className="h-9 w-full max-w-xs rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {OPTIONS.map((n) => (
            <option key={n} value={n} className="bg-popover text-popover-foreground">
              {n} fps{n === 15 ? " (padrão)" : ""}
            </option>
          ))}
        </select>
        <p className="text-xs leading-normal text-muted-foreground">
          Mais quadros deixam o movimento mais fluido (vídeos, animações), mas usam mais internet e mais processador de quem compartilha. A resolução da imagem é a da tela ou janela compartilhada:
          o Jitsi não oferece controle de resolução do compartilhamento.
        </p>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  );
}
