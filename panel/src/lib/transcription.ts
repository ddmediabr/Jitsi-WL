/** Transcrição por IA (Onda 11): módulo puro (servidor e navegador). */

/** Ordem de prioridade da cascata: cada modelo tem a própria cota, então o próximo só entra quando o anterior falha. */
export const CASCADE = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"] as const;
export type ModelId = (typeof CASCADE)[number];

export const MODEL_LABELS: Record<ModelId, string> = {
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash Lite",
};

export function isModelId(v: unknown): v is ModelId {
  return typeof v === "string" && (CASCADE as readonly string[]).includes(v);
}

export const modelLabel = (id: string | null | undefined) => (id && isModelId(id) ? MODEL_LABELS[id] : (id ?? "—"));

/** Rodadas de uma execução: a primeira e até 2 novas, com 1 h de intervalo. Depois disso, erro definitivo. */
export const MAX_ROUNDS = 3;
export const RETRY_DELAY_MS = 3600_000;
/** Tentativas seguidas quando o usuário escolhe UM modelo. */
export const SINGLE_MODEL_ATTEMPTS = 3;

/** Uma fala da transcrição. `inicio` em segundos desde o começo da gravação. */
export type Segment = { inicio: number; falante: string; texto: string };

export type Analysis = {
  titulo: string;
  resumo_executivo: string;
  participantes: { nome: string; papel: string }[];
  topicos: { titulo: string; resumo: string; falantes: string[] }[];
  decisoes: { decisao: string; contexto: string; responsaveis: string[] }[];
  pendencias: { descricao: string; responsavel: string; prazo: string }[];
  insights: { titulo: string; descricao: string }[];
  tarefas_por_falante: { falante: string; tarefas: { descricao: string; prazo: string; combinado_com: string }[] }[];
  pontos_de_atencao: string[];
};

/** Um registro da cascata: o que foi tentado, em qual modelo, e como terminou. */
export type Attempt = { rodada?: number; etapa: "transcricao" | "analise"; modelo: string; tentativa: number; ok: boolean; tipo?: string; erro?: string; ms: number };

export const formatClock = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** "HH:MM:SS", "MM:SS" ou "SS" -> segundos (0 se não entender). */
export function parseClock(text: string): number {
  const parts = text.trim().split(":").map((p) => Number(p.replace(",", ".")));
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}
