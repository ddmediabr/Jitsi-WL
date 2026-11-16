import "server-only";
import { DEFAULT_TZ, isValidTimeZone } from "@/lib/tz";
import { getSetting } from "@/server/settings";

/** Fuso horário escolhido nas configurações (padrão: Brasília). */
export async function getTimeZone(): Promise<string> {
  const tz = await getSetting("timezone");
  return isValidTimeZone(tz) ? tz : DEFAULT_TZ;
}
