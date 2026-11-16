import "server-only";
import { headers } from "next/headers";

/**
 * IP do cliente. Atrás do Traefik o ÚLTIMO item de X-Forwarded-For é o que o proxy acrescentou
 * (o cliente não controla); itens anteriores podem ser forjados e são ignorados.
 */
export async function clientInfo() {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  const ip = (xff ? xff.split(",").at(-1)?.trim() : null) || h.get("x-real-ip") || "desconhecido";
  return { ip: ip.slice(0, 64), userAgent: (h.get("user-agent") ?? "").slice(0, 300), headers: h };
}
