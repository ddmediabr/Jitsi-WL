/**
 * Política de trocas de nome de exibição e de foto feitas PELO PRÓPRIO usuário (o painel troca sem limite):
 *   - as 3 primeiras trocas não têm prazo;
 *   - a 4ª só pode ser feita 15 dias depois da 3ª;
 *   - da 5ª em diante, 30 dias depois da anterior.
 * Nome e foto compartilham UMA conta só: trocar o nome ou a foto soma 1 troca no mesmo contador.
 */
import { DEFAULT_TZ, dateFormatter } from "@/lib/tz";

export const FREE_CHANGES = 3;
export const FOURTH_WAIT_DAYS = 15;
export const LATER_WAIT_DAYS = 30;
const DAY_MS = 86_400_000;

export type ChangeState = { count: number; lastAt: Date | null };

export const formatWhen = (d: Date, tz = DEFAULT_TZ) => dateFormatter(tz).format(d);

/** Espera (em dias) exigida antes da PRÓXIMA troca, dado quantas já foram feitas. 0 = livre. */
export function waitDaysAfter(count: number): number {
  if (count < FREE_CHANGES) return 0;
  return count === FREE_CHANGES ? FOURTH_WAIT_DAYS : LATER_WAIT_DAYS;
}

export type Evaluation = { allowed: true; freeLeft: number } | { allowed: false; nextAt: Date };

/** Pode trocar agora? */
export function evaluate(state: ChangeState, now: Date): Evaluation {
  const wait = waitDaysAfter(state.count);
  if (wait === 0 || !state.lastAt) return { allowed: true, freeLeft: Math.max(0, FREE_CHANGES - state.count) };
  const nextAt = new Date(state.lastAt.getTime() + wait * DAY_MS);
  return now.getTime() >= nextAt.getTime() ? { allowed: true, freeLeft: 0 } : { allowed: false, nextAt };
}

/** Aviso mostrado a quem acabou de fazer a troca (count = quantas trocas existem DEPOIS desta). */
export function noticeAfterChange(what: "nome" | "foto", countAfter: number, now: Date, tz = DEFAULT_TZ): string {
  const label = what === "nome" ? "do nome" : "da foto";
  if (countAfter < FREE_CHANGES) {
    const left = FREE_CHANGES - countAfter;
    return `Troca ${label} feita. Você ainda tem ${left} ${left === 1 ? "troca" : "trocas"} de nome ou foto sem prazo.`;
  }
  const wait = waitDaysAfter(countAfter);
  const next = new Date(now.getTime() + wait * DAY_MS);
  const first = countAfter === FREE_CHANGES ? "Essa foi a sua última troca sem prazo. " : "";
  return `Troca ${label} feita. ${first}A próxima só poderá ser feita daqui a ${wait} dias, a partir de ${formatWhen(next, tz)}.`;
}

/** Texto de situação atual (para mostrar na tela de perfil). */
export function statusText(state: ChangeState, now: Date, tz = DEFAULT_TZ): string {
  const ev = evaluate(state, now);
  if (!ev.allowed) return `Você poderá trocar o nome ou a foto novamente a partir de ${formatWhen(ev.nextAt, tz)}.`;
  if (state.count < FREE_CHANGES) {
    const left = FREE_CHANGES - state.count;
    return `Você tem ${left} ${left === 1 ? "troca" : "trocas"} de nome ou foto sem prazo.`;
  }
  return `A troca de nome ou foto está liberada. Depois dela, a próxima só poderá ser feita daqui a ${waitDaysAfter(state.count + 1)} dias.`;
}
