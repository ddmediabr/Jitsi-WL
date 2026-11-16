import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import https from "node:https";

/**
 * Cliente da API interna do Prosody (mod_ddmedia_admin_api). Todo pedido é assinado:
 * HMAC-SHA256(segredo, "<timestamp>.<nonce>.<corpo>").
 * Variáveis (só no Coolify): PROSODY_ADMIN_URL (ex.: http://<contêiner>:5280/ddmedia-admin),
 * PROSODY_ADMIN_SECRET (mesmo conteúdo do arquivo ddmedia-admin.secret do Prosody) e,
 * opcionalmente, PROSODY_ADMIN_HOST (cabeçalho Host; padrão meet.jitsi).
 *
 * O corpo pode conter uma senha (Onda 3): este módulo nunca registra corpo nem resposta.
 */
export class ProsodyNotConfigured extends Error {}

export type ProsodyReply = { status: number; json: Record<string, unknown> };

export function prosodyConfigured(): boolean {
  const secret = process.env.PROSODY_ADMIN_SECRET;
  return Boolean(process.env.PROSODY_ADMIN_URL && secret && secret.length >= 32);
}

/** Pedido HTTP com `node:http(s)` (o `fetch` não deixa escolher o Host). Rede interna: prazo curto e resposta limitada. */
function request(
  rawUrl: string,
  method: "GET" | "POST",
  body: string,
  headers: Record<string, string>,
): Promise<ProsodyReply> {
  return new Promise((resolve, reject) => {
    const u = new URL(rawUrl);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      { method, timeout: 8_000, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers } },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          data += c;
          if (data.length > 256 * 1024) req.destroy(new Error("resposta grande demais"));
        });
        res.on("end", () => {
          let json: Record<string, unknown> = {};
          try {
            const parsed: unknown = JSON.parse(data);
            if (parsed && typeof parsed === "object") json = parsed as Record<string, unknown>;
          } catch {
            /* resposta sem JSON */
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", reject);
    req.end(body);
  });
}

/** Chama a API interna. Lança `ProsodyNotConfigured` se faltar URL/segredo; erros de rede propagam. */
export async function prosodyCall(method: "GET" | "POST", path: string, payload?: unknown): Promise<ProsodyReply> {
  const url = process.env.PROSODY_ADMIN_URL;
  const secret = process.env.PROSODY_ADMIN_SECRET;
  if (!url || !secret || secret.length < 32) throw new ProsodyNotConfigured();

  // String = corpo já serializado (a política envia exatamente os bytes cujo hash confere).
  const body = payload === undefined ? "" : typeof payload === "string" ? payload : JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", secret).update(`${ts}.${nonce}.${body}`).digest("hex");
  return request(`${url.replace(/\/$/, "")}${path}`, method, body, {
    Host: process.env.PROSODY_ADMIN_HOST ?? "meet.jitsi",
    "X-Timestamp": String(ts),
    "X-Nonce": nonce,
    "X-Signature": signature,
  });
}
