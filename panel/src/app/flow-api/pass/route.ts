import { randomBytes } from "node:crypto";

// Cookies de sessão do painel (ver infra/prosody/README.md). Todos HttpOnly, Secure, SameSite=Strict
// e de sessão do navegador: o JavaScript da página nunca os vê; o navegador os envia sozinho no
// aperto de mão do WebSocket do Jitsi (mesma origem) e o Prosody decide tudo no servidor.
//
//   __Host-ddpass    segredo do navegador (passe de reconexão; também liga o login à conta).
//   __Host-ddintent  "resume" = este acesso é uma RETOMADA de sessão do cadastrado; qualquer outro
//                    valor (ou ausência) = acesso comum. Sem essa intenção ninguém é escalado.
//
// Parâmetros: ?intent=resume|none (padrão none) e ?reset=1 (troca o segredo: encerra a ligação
// do navegador com a conta).
const BASE = "Path=/; Secure; HttpOnly; SameSite=Strict";

export function GET(request: Request) {
  const url = new URL(request.url);
  const reset = url.searchParams.get("reset") === "1";
  const intent = url.searchParams.get("intent") === "resume" ? "resume" : "none";
  const has = /(?:^|;\s*)__Host-ddpass=[0-9a-f]{32,}/.test(request.headers.get("cookie") ?? "");

  const headers = new Headers({ "Cache-Control": "no-store" });
  if (reset || !has) {
    headers.append("Set-Cookie", `__Host-ddpass=${randomBytes(32).toString("hex")}; ${BASE}`);
  }
  headers.append("Set-Cookie", `__Host-ddintent=${intent}; ${BASE}`);
  return Response.json({ ok: true }, { headers });
}
