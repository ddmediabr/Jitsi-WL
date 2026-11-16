"use client";

import { useActionState } from "react";
import FilePicker from "@/components/settings/FilePicker";
import FormMessage from "@/components/settings/FormMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brandUrl, MAX_BRAND_NAME, MAX_ENTRY_IMAGE_BYTES, MAX_ENTRY_VIDEO_BYTES, MAX_IMAGE_BYTES, TOO_BIG_MESSAGE, type Brand, type BrandAssetKind } from "@/lib/brand";
import {
  removeBrandAssetAction,
  saveBrandNameAction,
  uploadBrandAssetAction,
  type BrandFormState,
} from "@/server/brand/actions";

const initial: BrandFormState = {};

export function BrandNameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(saveBrandNameAction, initial);
  return (
    <form action={action} className="grid max-w-none gap-3" noValidate>
      <FormMessage error={state.error} ok={state.ok} />
      <Label htmlFor="brand-name">Nome da marca</Label>
      <div className="flex gap-2">
        <Input id="brand-name" name="name" defaultValue={name} maxLength={MAX_BRAND_NAME} autoComplete="off" required />
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
      <p className="text-xs leading-normal text-muted-foreground">Aparece no painel, nas telas de entrada e na aba. Com logo, o logo substitui o nome.</p>
    </form>
  );
}

const COPY: Record<BrandAssetKind, { title: string; hint: string; sample: string; stage: string }> = {
  logo_dark: {
    title: "Logo do tema escuro",
    hint: "Para o tema escuro (fundo #040B17): use uma versão clara. PNG, JPG, TIFF ou WebP, até 2 MB, de preferência com fundo transparente.",
    sample: "h-10 w-auto max-w-56 object-contain object-left",
    stage: "bg-[#040B17]",
  },
  logo_light: {
    title: "Logo do tema claro",
    hint: "Para o tema claro (fundo #F2F6FC): use uma versão escura. Com só um logo, ele serve para os dois temas.",
    sample: "h-10 w-auto max-w-56 object-contain object-left",
    stage: "bg-[#F2F6FC]",
  },
  entry_video: {
    title: "Vídeo de fundo",
    hint: "MP4 de até 10 MB. O painel converte para 8 s em laço, 1920 × 1080, sem áudio e até 3 MB. Pode levar até 1 minuto.",
    sample: "h-full w-auto object-contain",
    stage: "bg-muted/50",
  },
  entry_image: {
    title: "Imagem de fundo",
    hint: "PNG, JPG, TIFF ou WebP, até 3 MB. Guardada em WebP, até 1920 × 1080.",
    sample: "h-full w-auto object-contain",
    stage: "bg-muted/50",
  },
  favicon: {
    title: "Favicon",
    hint: "PNG, JPG, TIFF ou WebP, até 2 MB, de preferência quadrada. Guardado em 64 × 64.",
    sample: "size-8 object-contain",
    stage: "bg-muted/50",
  },
};

export function BrandAssetForm({ kind, version }: { kind: BrandAssetKind; version: number | null }) {
  // Confere o tamanho no navegador antes de enviar (um arquivo enorme nem sai da máquina).
  const guarded = async (prev: BrandFormState, formData: FormData): Promise<BrandFormState> => {
    const file = formData.get("file");
    const entry = kind === "entry_video" || kind === "entry_image";
    const max = kind === "entry_video" ? MAX_ENTRY_VIDEO_BYTES : kind === "entry_image" ? MAX_ENTRY_IMAGE_BYTES : MAX_IMAGE_BYTES;
    if (file instanceof File && file.size > max) return { error: entry ? `O arquivo deve ter no máximo ${max / 1024 / 1024} MB.` : TOO_BIG_MESSAGE };
    return uploadBrandAssetAction(prev, formData);
  };
  const [state, action, pending] = useActionState(guarded, initial);
  const [rState, rAction, rPending] = useActionState(removeBrandAssetAction, initial);
  const c = COPY[kind];
  return (
    <div className="grid max-w-none gap-3">
      <h3 className="text-sm leading-normal font-medium">{c.title}</h3>
      <FormMessage error={state.error ?? rState.error} ok={state.ok ?? rState.ok} />
      <div className="flex items-center gap-4">
        <div className={`flex h-16 min-w-16 items-center justify-center rounded-xl border p-2 ${c.stage}`}>
          {version !== null ? (
            kind === "entry_video" ? (
              <video src={brandUrl(kind, version)} className={c.sample} muted loop autoPlay playsInline aria-label={`${c.title} atual`} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandUrl(kind, version)} alt={`${c.title} atual`} className={c.sample} />
            )
          ) : (
            <span className={`text-xs ${kind === "favicon" ? "text-muted-foreground" : "text-neutral-500"}`}>Nenhum</span>
          )}
        </div>
        <form action={action} className="grid gap-2" noValidate>
          <input type="hidden" name="kind" value={kind} />
          <Label htmlFor={`brand-${kind}`} className="sr-only">
            Nova imagem de {c.title.toLowerCase()}
          </Label>
          <FilePicker id={`brand-${kind}`} name="file" accept={kind === "entry_video" ? "video/mp4" : "image/png,image/jpeg,image/tiff,image/webp"} />
          <Button type="submit" variant="outline" size="sm" disabled={pending} className="w-fit">
            {pending ? (kind === "entry_video" ? "Convertendo…" : "Enviando…") : version !== null ? "Trocar" : "Enviar"}
          </Button>
        </form>
        {version !== null && (
          <form action={rAction}>
            <input type="hidden" name="kind" value={kind} />
            <Button type="submit" variant="ghost" size="sm" disabled={rPending}>
              Remover
            </Button>
          </form>
        )}
      </div>
      <p className="text-xs leading-normal text-muted-foreground">{c.hint}</p>
    </div>
  );
}

export function BrandSection({ brand }: { brand: Brand }) {
  return (
    <div className="grid gap-8">
      <BrandNameForm name={brand.name} />
      <BrandAssetForm kind="logo_dark" version={brand.logoDarkVersion} />
      <BrandAssetForm kind="logo_light" version={brand.logoLightVersion} />
      <BrandAssetForm kind="favicon" version={brand.faviconVersion} />
    </div>
  );
}
