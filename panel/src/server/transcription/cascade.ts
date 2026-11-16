import "server-only";
import type { Attempt } from "@/lib/transcription";
import { errorKind, GeminiError } from "./gemini";

const clip = (s: string, n = 200) => s.replace(/\s+/g, " ").slice(0, n);

/**
 * Cascata com failover: tenta os modelos na ordem. Em cada modelo:
 *  - erro de cota/tokens ou pedido recusado -> UMA tentativa e segue para o próximo modelo;
 *  - erro passageiro (instabilidade, resposta vazia ou cortada) -> até DUAS tentativas, depois segue;
 *  - chave inválida -> encerra tudo.
 * Com `maxAttempts` (modo "só um modelo"), qualquer erro (exceto chave inválida) é repetido até esse total de tentativas seguidas.
 * Cada tentativa fica registrada em `log`.
 */
export async function runCascade<T>(opts: {
  etapa: Attempt["etapa"];
  models: readonly string[];
  log: Attempt[];
  fn: (model: string) => Promise<T>;
  retryDelayMs?: number;
  rodada?: number;
  maxAttempts?: number;
}): Promise<{ value: T; model: string }> {
  const failures: string[] = [];
  for (const model of opts.models) {
    const limit = opts.maxAttempts ?? 2;
    for (let tentativa = 1; tentativa <= limit; tentativa++) {
      const t0 = Date.now();
      try {
        const value = await opts.fn(model);
        opts.log.push({ rodada: opts.rodada, etapa: opts.etapa, modelo: model, tentativa, ok: true, ms: Date.now() - t0 });
        return { value, model };
      } catch (e) {
        const kind = errorKind(e);
        const message = e instanceof Error ? clip(e.message) : "erro desconhecido";
        opts.log.push({ rodada: opts.rodada, etapa: opts.etapa, modelo: model, tentativa, ok: false, tipo: kind, erro: message, ms: Date.now() - t0 });
        if (kind === "auth") throw e;
        failures.push(`${model}: ${clip(message, 120)}`);
        if ((opts.maxAttempts === undefined && kind !== "transient") || tentativa === limit) break; // automático: cota/recusa = tentativa única
        await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 5000));
      }
    }
  }
  throw new GeminiError("transient", `Todos os modelos falharam. ${failures.slice(-3).join(" | ")}`);
}
