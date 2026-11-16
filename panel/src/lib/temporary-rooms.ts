/** Opções de sala temporária (usadas pelo painel e validadas de novo no servidor). */

/** Prazo de existência, contado a partir de agora. */
export const TTL_PRESETS = [
  { id: "1h", label: "1 hora", seconds: 3600 },
  { id: "4h", label: "4 horas", seconds: 4 * 3600 },
  { id: "12h", label: "12 horas", seconds: 12 * 3600 },
  { id: "1d", label: "1 dia", seconds: 86_400 },
  { id: "3d", label: "3 dias", seconds: 3 * 86_400 },
  { id: "7d", label: "7 dias", seconds: 7 * 86_400 },
  { id: "30d", label: "30 dias", seconds: 30 * 86_400 },
] as const;
export type TtlId = (typeof TTL_PRESETS)[number]["id"];

export const DEFAULT_TTL: TtlId = "1d";

export function ttlSeconds(id: string): number | null {
  return TTL_PRESETS.find((p) => p.id === id)?.seconds ?? null;
}


/** O instante já passou? (fica aqui, fora dos componentes, para a tela não chamar `Date.now()` ao renderizar) */
export const isPast = (d: Date) => d.getTime() <= Date.now();
