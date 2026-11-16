import "server-only";
import { readFile, stat } from "node:fs/promises";
import { Agent, fetch as undiciFetch } from "undici";
import { env } from "@/server/env";

// O fetch do Node corta a espera da resposta em 5 minutos; transcrições longas precisam de mais (o limite real é o AbortSignal de cada chamada).
const agent = new Agent({ headersTimeout: 15 * 60_000, bodyTimeout: 15 * 60_000, connectTimeout: 20_000 });

const BASE = "https://generativelanguage.googleapis.com";

/**
 * Tipos de erro (decidem quantas tentativas o modelo recebe):
 *  - quota: acabou a cota/tokens (HTTP 429 ou RESOURCE_EXHAUSTED) -> 1 tentativa e passa ao próximo modelo;
 *  - permanent: pedido recusado (400/403/404, ex.: limite de tokens de entrada, arquivo inválido) -> 1 tentativa e passa ao próximo;
 *  - transient: instabilidade (5xx, tempo esgotado, rede, resposta vazia ou JSON truncado) -> até 2 tentativas;
 *  - auth: chave inválida -> encerra tudo (todos os modelos usam a mesma chave).
 */
export type ErrorKind = "quota" | "permanent" | "transient" | "auth";

export class GeminiError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    public status: number | null = null,
  ) {
    super(message);
  }
}

/** Tipo do erro sem depender de `instanceof` (o mesmo módulo pode ser carregado por caminhos diferentes). */
export function errorKind(e: unknown): ErrorKind {
  const k = (e as { kind?: unknown } | null)?.kind;
  return k === "quota" || k === "permanent" || k === "auth" || k === "transient" ? k : "transient";
}

const clip = (s: string, n = 220) => s.replace(/\s+/g, " ").trim().slice(0, n);

function classify(status: number, bodyText: string): GeminiError {
  let message = clip(bodyText);
  let code = "";
  try {
    const j = JSON.parse(bodyText) as { error?: { message?: string; status?: string } };
    message = clip(j.error?.message ?? message);
    code = j.error?.status ?? "";
  } catch {
    /* corpo não era JSON */
  }
  if (status === 401 || /api key|API_KEY_INVALID/i.test(message)) return new GeminiError("auth", `Chave do Gemini recusada: ${message}`, status);
  if (status === 429 || code === "RESOURCE_EXHAUSTED" || /quota/i.test(message)) return new GeminiError("quota", `Cota esgotada (${status}): ${message}`, status);
  if (status >= 500 || status === 408) return new GeminiError("transient", `Erro do serviço (${status}): ${message}`, status);
  return new GeminiError("permanent", `Pedido recusado (${status}${code ? ` ${code}` : ""}): ${message}`, status);
}

function apiKey(): string {
  const k = env().GEMINI_API_KEY;
  if (!k) throw new GeminiError("auth", "A chave do Gemini (GEMINI_API_KEY) não está configurada.");
  return k;
}

async function call(url: string, init: RequestInit & { timeoutMs?: number }): Promise<Response> {
  try {
    // O fetch do próprio undici combina com o Agent acima (misturar com o fetch embutido do Node dá erro de versão).
    const res = await undiciFetch(url, {
      method: init.method,
      body: init.body as never,
      dispatcher: agent,
      signal: AbortSignal.timeout(init.timeoutMs ?? 120_000),
      headers: { ...(init.headers as Record<string, string>), "x-goog-api-key": apiKey() },
    });
    return res as unknown as Response;
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    const cause = (e as { cause?: { code?: string; message?: string } } | null)?.cause;
    const name = e instanceof Error ? e.name : "erro";
    const why = name === "TimeoutError" || name === "AbortError" ? "tempo esgotado" : (cause?.code ?? cause?.message ?? "");
    throw new GeminiError("transient", `Falha de rede com o Gemini: ${name}${why ? ` (${String(why).slice(0, 80)})` : ""}`);
  }
}

/** Envia o áudio pela Files API (método resumível) e espera ficar pronto. Devolve o endereço e o nome do arquivo. */
export async function uploadAudio(path: string, mime: string, displayName: string): Promise<{ uri: string; name: string }> {
  const size = (await stat(path)).size;
  const start = await call(`${BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!start.ok) throw classify(start.status, await start.text());
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new GeminiError("transient", "O Gemini não devolveu o endereço de envio.");

  const body = await readFile(path);
  const up = await call(uploadUrl, {
    method: "POST",
    headers: { "Content-Length": String(size), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: new Uint8Array(body),
    timeoutMs: 600_000,
  });
  if (!up.ok) throw classify(up.status, await up.text());
  const file = ((await up.json()) as { file?: { name?: string; uri?: string; state?: string } }).file;
  if (!file?.name || !file.uri) throw new GeminiError("transient", "Resposta de envio sem o arquivo.");

  // Arquivos de áudio costumam ficar ACTIVE na hora; confere por até 90 s.
  let state = file.state ?? "ACTIVE";
  for (let i = 0; i < 45 && state === "PROCESSING"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const g = await call(`${BASE}/v1beta/${file.name}`, { method: "GET" });
    if (!g.ok) throw classify(g.status, await g.text());
    state = ((await g.json()) as { state?: string }).state ?? "ACTIVE";
  }
  if (state === "FAILED") throw new GeminiError("permanent", "O Gemini não conseguiu processar o áudio enviado.");
  if (state === "PROCESSING") throw new GeminiError("transient", "O áudio demorou demais para ficar pronto no Gemini.");
  return { uri: file.uri, name: file.name };
}

/** Apaga o arquivo no Gemini (privacidade: o áudio não fica lá). Falhar aqui não atrapalha nada. */
export async function deleteFile(name: string): Promise<void> {
  await call(`${BASE}/v1beta/${name}`, { method: "DELETE", timeoutMs: 20_000 }).catch(() => undefined);
}

export type Generated = { text: string; inputTokens: number; outputTokens: number };

/** Uma chamada de geração com saída em JSON estruturado. `file` é opcional (etapa de transcrição). */
export async function generateJson(opts: { model: string; prompt: string; schema: unknown; file?: { uri: string; mime: string }; maxOutputTokens?: number }): Promise<Generated> {
  const parts: unknown[] = [{ text: opts.prompt }];
  if (opts.file) parts.push({ file_data: { mime_type: opts.file.mime, file_uri: opts.file.uri } });
  const res = await call(`${BASE}/v1beta/models/${opts.model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeoutMs: opts.file ? 480_000 : 240_000,
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: opts.schema, maxOutputTokens: opts.maxOutputTokens ?? 65_536 },
    }),
  });
  if (!res.ok) throw classify(res.status, await res.text());
  const j = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  if (j.promptFeedback?.blockReason) throw new GeminiError("permanent", `Conteúdo bloqueado pelo Gemini (${j.promptFeedback.blockReason}).`);
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text.trim()) throw new GeminiError("transient", `Resposta vazia do modelo${cand?.finishReason ? ` (${cand.finishReason})` : ""}.`);
  if (cand?.finishReason === "MAX_TOKENS") throw new GeminiError("transient", "A resposta passou do limite de saída do modelo e foi cortada.");
  return { text, inputTokens: j.usageMetadata?.promptTokenCount ?? 0, outputTokens: j.usageMetadata?.candidatesTokenCount ?? 0 };
}
