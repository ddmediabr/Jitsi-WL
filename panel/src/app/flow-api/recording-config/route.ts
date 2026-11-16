import { createHash, timingSafeEqual } from "node:crypto";
import { effectiveQuality, isQuality, QUALITIES } from "@/lib/recording-quality";
import { env } from "@/server/env";
import { getSetting } from "@/server/settings";

// O gravador (Jibri) consulta a resolução escolhida no painel quando inicia. Só ele, com o mesmo segredo da entrega.
//   GET  Authorization: Bearer <segredo>  ->  texto "LxA" (ex.: 1600x900)
export const dynamic = "force-dynamic";

const digest = (v: string) => createHash("sha256").update(v).digest();

export async function GET(request: Request) {
  const secret = env().RECORDING_INGEST_SECRET;
  const given = /^Bearer (.{32,256})$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!secret || !timingSafeEqual(digest(given), digest(secret))) return new Response("não autorizado", { status: 401, headers: { "Cache-Control": "no-store" } });
  const stored = await getSetting("recording_quality");
  const q = effectiveQuality(isQuality(stored) ? stored : "900p", await getSetting("recording_dedicated"));
  return new Response(QUALITIES[q].resolution, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
