import { formatClock, modelLabel, type Segment } from "@/lib/transcription";

export type DocMeta = {
  brand: string;
  room: string;
  when: string; // data e hora formatadas no fuso do painel
  duration: string;
  initiator: string | null;
  model: string | null;
};

/** Quebra o texto em linhas de até `width` colunas, sem cortar palavras. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Junta falas seguidas da mesma pessoa (a IA às vezes quebra uma fala longa em várias). */
export function mergeTurns(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (last && last.falante === s.falante) last.texto = `${last.texto} ${s.texto}`.trim();
    else out.push({ ...s });
  }
  return out;
}

const RULE = "=".repeat(78);
const THIN = "-".repeat(78);

/**
 * Transcrição diagramada em texto: cabeçalho com os dados da reunião, a lista de participantes e as falas em blocos
 * ("[hh:mm:ss] NOME" e o texto logo abaixo, com quebra de linha em 90 colunas).
 */
export function renderTranscriptTxt(meta: DocMeta, segments: Segment[]): string {
  const turns = mergeTurns(segments);
  const speakers = [...new Set(turns.map((t) => t.falante))];
  const head = [
    RULE,
    `TRANSCRIÇÃO DA REUNIÃO — ${meta.brand.toUpperCase()}`,
    RULE,
    `Sala:          ${meta.room}`,
    `Data e hora:   ${meta.when}`,
    `Duração:       ${meta.duration}`,
    meta.initiator ? `Gravação por:  ${meta.initiator}` : null,
    `Participantes: ${speakers.length ? speakers.join(", ") : "—"}`,
    `Gerado por IA (${modelLabel(meta.model)}). Confira trechos importantes no áudio original.`,
    THIN,
    "",
  ].filter((l): l is string => l !== null);

  const body = turns.length
    ? turns.flatMap((t) => [`[${formatClock(t.inicio)}] ${t.falante.toUpperCase()}`, ...wrap(t.texto, 90).map((l) => `    ${l}`), ""])
    : ["(Nenhuma fala foi identificada no áudio desta gravação.)", ""];
  return [...head, ...body, THIN, "Fim da transcrição.", ""].join("\n");
}

/** Texto corrido para a etapa de análise: "[hh:mm:ss] Nome: fala". */
export function transcriptForAnalysis(segments: Segment[]): string {
  return mergeTurns(segments)
    .map((t) => `[${formatClock(t.inicio)}] ${t.falante}: ${t.texto}`)
    .join("\n");
}
