"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { invalidateBrand } from "@/server/brand/brand";
import { setSetting } from "@/server/settings";

export type ShareState = { error?: string; ok?: string };

/** Quadros por segundo permitidos no compartilhamento de tela (arquivo "use server": só funções async podem ser exportadas). */
const SHARE_FPS_OPTIONS = [5, 10, 15, 20, 30] as const;

/** Taxa de quadros do compartilhamento de tela (só o proprietário). Vale para quem entrar na sala depois de salvar. */
export async function saveShareFpsAction(_prev: ShareState, formData: FormData): Promise<ShareState> {
  const owner = await requireFullAuth("owner");
  const fps = Number(formData.get("fps"));
  if (!(SHARE_FPS_OPTIONS as readonly number[]).includes(fps)) return { error: "Escolha um valor da lista." };
  await setSetting("share_fps", fps, owner.id);
  invalidateBrand();
  await audit({ action: "settings.share", actorId: owner.id, actorLabel: owner.username, targetType: "setting", targetId: "share_fps", details: { fps } });
  revalidatePath("/settings/configuracoes");
  return { ok: "Salvo. Vale para quem entrar na sala a partir de agora." };
}
