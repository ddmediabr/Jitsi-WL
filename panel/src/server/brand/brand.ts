import "server-only";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";
import { EMPTY_ENTRY, type Brand, type BrandAssetKind } from "@/lib/brand";
import { parseEntryBg, type EntryBg } from "@/lib/entry-bg";
import { EXIT_DEFAULTS } from "@/lib/exit-texts";
import { db } from "@/server/db";
import { brandAssets } from "@/server/db/schema";
import { BRAND_DEFAULT, getSetting, setSetting } from "@/server/settings";
import { processEntryImage, processFavicon, processLogo } from "./images";
import { processEntryVideo } from "./video";

export type BrandKind = BrandAssetKind;
export const BRAND_KINDS: BrandKind[] = ["logo_dark", "logo_light", "favicon", "entry_video", "entry_image"];
export const isBrandKind = (v: string): v is BrandKind => (BRAND_KINDS as string[]).includes(v);


const TTL_MS = 5 * 60_000;
// Guardado em globalThis: o Next pode carregar este módulo mais de uma vez (página, layout e ações), e cada cópia teria o seu cache.
// Com uma cópia só, o `invalidateBrand()` de uma ação vale para todas.
const store = globalThis as unknown as { __ddBrand?: { at: number; value: Brand } | null };

export function invalidateBrand(): void {
  store.__ddBrand = null;
}

/** Largura / altura do logo já gravado (o servidor reprocessa a imagem no envio); null se não der para ler. */
async function ratioOf(data: Buffer): Promise<number | null> {
  try {
    const m = await sharp(data).metadata();
    return m.width && m.height ? m.width / m.height : null;
  } catch {
    return null;
  }
}

/** Em cache (o layout raiz precisa disto em TODA página); ao salvar, `invalidateBrand()` descarta na hora. */
export async function getBrand(): Promise<Brand> {
  if (store.__ddBrand && Date.now() - store.__ddBrand.at < TTL_MS) return store.__ddBrand.value;
  const value: Brand = { name: BRAND_DEFAULT, logoDarkVersion: null, logoLightVersion: null, faviconVersion: null, logoDarkRatio: null, logoLightRatio: null, ...EMPTY_ENTRY };
  try {
    value.name = (await getSetting("brand_name")) || value.name;
    value.entryBg = parseEntryBg(await getSetting("entry_bg"));
    value.shareFps = await getSetting("share_fps");
    value.exit = {
      leftTitle: (await getSetting("exit_left_title")).trim() || EXIT_DEFAULTS.leftTitle,
      leftText: (await getSetting("exit_left_text")).trim() || EXIT_DEFAULTS.leftText,
      kickedTitle: (await getSetting("exit_kicked_title")).trim() || EXIT_DEFAULTS.kickedTitle,
      kickedText: (await getSetting("exit_kicked_text")).trim() || EXIT_DEFAULTS.kickedText,
      endedTitle: (await getSetting("exit_ended_title")).trim() || EXIT_DEFAULTS.endedTitle,
      endedText: (await getSetting("exit_ended_text")).trim() || EXIT_DEFAULTS.endedText,
    };
    // Só os logos precisam dos bytes (para medir a proporção); o vídeo e a imagem de fundo ficam só com a versão.
    const rows = await db()
      .select({ kind: brandAssets.kind, version: brandAssets.version, data: sql<Buffer | null>`case when ${brandAssets.kind} like 'logo_%' then ${brandAssets.data} else null end` })
      .from(brandAssets);
    for (const r of rows) {
      if (r.kind === "logo_dark") {
        value.logoDarkVersion = r.version;
        value.logoDarkRatio = r.data ? await ratioOf(r.data) : null;
      }
      if (r.kind === "logo_light") {
        value.logoLightVersion = r.version;
        value.logoLightRatio = r.data ? await ratioOf(r.data) : null;
      }
      if (r.kind === "favicon") value.faviconVersion = r.version;
      if (r.kind === "entry_video") value.entryVideoVersion = r.version;
      if (r.kind === "entry_image") value.entryImageVersion = r.version;
    }
  } catch {
    return value; // banco fora: padrão, sem guardar no cache
  }
  store.__ddBrand = { at: Date.now(), value };
  return value;
}

export async function getBrandAsset(kind: BrandKind): Promise<{ data: Buffer; mime: string; version: number } | null> {
  const [row] = await db().select().from(brandAssets).where(eq(brandAssets.kind, kind)).limit(1);
  return row ? { data: row.data, mime: row.mime, version: row.version } : null;
}

export type BrandResult = { ok: true } | { ok: false; error: string };

/** Valida, reprocessa e grava o logo/favicon (substitui o anterior). */
export async function saveBrandAsset(kind: BrandKind, bytes: Buffer): Promise<BrandResult> {
  const processed =
    kind === "favicon"
      ? await processFavicon(bytes)
      : kind === "entry_video"
        ? await processEntryVideo(bytes)
        : kind === "entry_image"
          ? await processEntryImage(bytes)
          : await processLogo(bytes);
  if (!processed.ok) return processed;
  await db()
    .insert(brandAssets)
    .values({ kind, data: processed.data, mime: processed.mime, version: 1 })
    .onConflictDoUpdate({
      target: brandAssets.kind,
      set: { data: processed.data, mime: processed.mime, version: sql`${brandAssets.version} + 1`, updatedAt: new Date() },
    });
  invalidateBrand();
  return { ok: true };
}

export async function removeBrandAsset(kind: BrandKind): Promise<void> {
  await db().delete(brandAssets).where(eq(brandAssets.kind, kind));
  invalidateBrand();
}

/** Grava o modo e os filtros do fundo das páginas de entrada. */
export async function saveEntryBg(bg: EntryBg, actorId: string): Promise<void> {
  await setSetting("entry_bg", bg as unknown as Record<string, unknown>, actorId);
  invalidateBrand();
}
