"use server";

import { revalidatePath } from "next/cache";
import { MAX_ENTRY_IMAGE_BYTES, MAX_ENTRY_VIDEO_BYTES, validateBrandName } from "@/lib/brand";
import { BLENDS, cleanFilter, parseEntryBg, type BgMode } from "@/lib/entry-bg";
import { findImagePreset, findVideoPreset } from "@/lib/entry-preset-list";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { setSetting } from "@/server/settings";
import { getBrand, invalidateBrand, isBrandKind, removeBrandAsset, saveBrandAsset, saveEntryBg, type BrandKind } from "./brand";
import { MAX_BRAND_BYTES } from "./images";

/** Identidade da marca (nome, logos, favicon): fica em Personalização, com o mesmo acesso da página (administrador ou proprietário). A checagem é do servidor, em toda ação. */
export type BrandFormState = { error?: string; ok?: string };

const LABEL: Record<BrandKind, string> = {
  logo_dark: "Logo do tema escuro",
  logo_light: "Logo do tema claro",
  favicon: "Favicon",
  entry_video: "Vídeo de fundo",
  entry_image: "Imagem de fundo",
};

export async function saveBrandNameAction(_prev: BrandFormState, formData: FormData): Promise<BrandFormState> {
  const owner = await requireFullAuth("admin");
  const v = validateBrandName(String(formData.get("name") ?? ""));
  if (!v.ok) return { error: v.error };
  await setSetting("brand_name", v.name, owner.id);
  invalidateBrand();
  await audit({ action: "settings.brand.name", actorId: owner.id, actorLabel: owner.username, targetType: "setting", targetId: "brand_name", details: { nome: v.name } });
  revalidatePath("/", "layout");
  return { ok: "Nome atualizado." };
}

export async function uploadBrandAssetAction(_prev: BrandFormState, formData: FormData): Promise<BrandFormState> {
  const owner = await requireFullAuth("admin");
  const kind = String(formData.get("kind") ?? "");
  if (!isBrandKind(kind)) return { error: "Tipo inválido." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: kind === "entry_video" ? "Escolha um vídeo." : "Escolha uma imagem." };
  const limit = kind === "entry_video" ? MAX_ENTRY_VIDEO_BYTES : kind === "entry_image" ? MAX_ENTRY_IMAGE_BYTES : MAX_BRAND_BYTES;
  if (file.size > limit) return { error: `O arquivo deve ter no máximo ${limit / 1024 / 1024} MB.` };
  const r = await saveBrandAsset(kind, Buffer.from(await file.arrayBuffer()));
  if (!r.ok) return { error: r.error };
  await audit({ action: `settings.brand.${kind}`, actorId: owner.id, actorLabel: owner.username, targetType: "setting", targetId: kind });
  revalidatePath("/", "layout");
  return { ok: LABEL[kind] + " atualizado." };
}

export async function removeBrandAssetAction(_prev: BrandFormState, formData: FormData): Promise<BrandFormState> {
  const owner = await requireFullAuth("admin");
  const kind = String(formData.get("kind") ?? "");
  if (!isBrandKind(kind)) return { error: "Tipo inválido." };
  await removeBrandAsset(kind);
  await audit({ action: `settings.brand.${kind}.remove`, actorId: owner.id, actorLabel: owner.username, targetType: "setting", targetId: kind });
  revalidatePath("/", "layout");
  return { ok: LABEL[kind] + " removido." };
}

/** Modo e filtros do fundo das páginas de entrada. Tudo é revalidado aqui (nunca confia no navegador). */
export async function saveEntryBgAction(_prev: BrandFormState, formData: FormData): Promise<BrandFormState> {
  const owner = await requireFullAuth("admin");
  const brand = await getBrand();
  const mode = String(formData.get("mode") ?? "none") as BgMode;
  if (mode !== "none" && mode !== "video" && mode !== "image") return { error: "Modo inválido." };
  const videoPreset = findVideoPreset(String(formData.get("video_preset") ?? ""))?.id ?? null;
  const imagePreset = findImagePreset(String(formData.get("image_preset") ?? ""))?.id ?? null;
  if (mode === "video" && videoPreset === null && brand.entryVideoVersion === null) return { error: "Envie um vídeo ou escolha um dos prontos antes de ativar o fundo em vídeo." };
  if (mode === "image" && imagePreset === null && brand.entryImageVersion === null) return { error: "Envie uma imagem ou escolha uma das prontas antes de ativar o fundo em imagem." };

  const read = (theme: "dark" | "light") => {
    const g = (k: string) => formData.get(`${theme}_${k}`);
    const blend = String(g("blend") ?? "");
    return cleanFilter(
      {
        invert: g("invert") === "on" || g("invert") === "true",
        blend: BLENDS.find((b) => b === blend),
        opacity: g("opacity"),
        brightness: g("brightness"),
        contrast: g("contrast"),
        saturate: g("saturate"),
        hue: g("hue"),
        posX: g("posX"),
      },
      theme,
    );
  };
  const bg = parseEntryBg({ mode, respectMotion: formData.get("respect_motion") === "on", videoPreset, imagePreset, auto: formData.get("auto") === "on", dark: read("dark"), light: read("light") });
  await saveEntryBg(bg, owner.id);
  await audit({ action: "settings.entry-bg", actorId: owner.id, actorLabel: owner.username, targetType: "setting", targetId: "entry_bg", details: { modo: bg.mode, preset: bg.mode === "video" ? bg.videoPreset : bg.mode === "image" ? bg.imagePreset : null } });
  revalidatePath("/", "layout");
  return { ok: "Fundo das páginas de entrada atualizado." };
}
