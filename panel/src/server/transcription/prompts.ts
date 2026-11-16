import "server-only";

/** Dados que ajudam a IA a acertar nomes e termos. */
export type MeetingContext = {
  brand: string;
  room: string;
  when: string; // data e hora já formatadas no fuso do painel
  initiator: string | null;
  candidates: string[]; // nomes de quem tem acesso à sala
  glossary: string;
};

const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (não informado)");

function contextBlock(c: MeetingContext, withInitiator = true): string {
  const glossary = c.glossary
    .split(/\r?\n|,/)
    .map((g) => g.trim())
    .filter(Boolean);
  return [
    `Organização: ${c.brand}`,
    `Sala: ${c.room}`,
    `Data e hora da reunião: ${c.when}`,
    withInitiator && c.initiator ? `Quem iniciou a gravação: ${c.initiator}` : null,
    `Pessoas que costumam participar desta sala (serve para acertar a grafia dos nomes):\n${list(c.candidates)}`,
    `Glossário (grafia correta de termos, siglas e nomes):\n${list(glossary)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function transcriptionPrompt(c: MeetingContext, chunk: { index: number; total: number }): string {
  return `Você é um transcritor profissional de reuniões de trabalho em português do Brasil.

Transcreva TODO o áudio anexo, fielmente, na ordem em que foi falado. Regras:
- Não resuma, não omita, não invente. Se um trecho for inaudível, escreva [inaudível].
- Separe as falas por pessoa pela voz. Use um nome real SOMENTE com evidência no próprio áudio: a pessoa se apresenta, é chamada pelo nome por outra, ou o contexto deixa inequívoco. A lista de pessoas abaixo serve só para a grafia correta dos nomes: NÃO atribua o nome de alguém da lista a uma voz sem essa evidência. Se não souber, use "Participante 1", "Participante 2"... e mantenha o MESMO rótulo para a mesma voz do começo ao fim.
- Cada item da lista é uma fala contínua de uma pessoa (junte frases seguidas da mesma pessoa; abra um novo item quando outra pessoa falar).
- "inicio" é o instante em que a fala começa, no formato HH:MM:SS, contado desde o começo DESTE áudio.
- Corrija a pontuação e a ortografia, mas mantenha o sentido e as palavras ditas (sem tirar gírias ou termos técnicos). Não escreva hesitações como "hum" ou "é...".
- Se não houver fala nenhuma, devolva a lista vazia.
${chunk.total > 1 ? `- Este áudio é a parte ${chunk.index} de ${chunk.total} de uma reunião maior.\n` : ""}
CONTEXTO DA REUNIÃO
${contextBlock(c, false)}`;
}

export function analysisPrompt(c: MeetingContext, transcriptText: string): string {
  return `Você é um secretário executivo que produz atas e análises de reuniões de trabalho, em português do Brasil, a partir da transcrição abaixo.

Regras:
- Baseie-se SOMENTE na transcrição. Não invente fatos, nomes, números nem prazos. Se algo não foi dito, deixe o campo vazio ("") ou a lista vazia.
- Seja objetivo e escreva frases completas, em tom profissional e neutro.
- "resumo_executivo": 1 a 3 parágrafos curtos com o essencial da reunião.
- "topicos": os assuntos discutidos, na ordem em que apareceram, cada um com um resumo claro e quem participou da discussão.
- "decisoes": o que foi efetivamente decidido ou aprovado, com o contexto e os responsáveis quando houver.
- "pendencias": assuntos em aberto ou que dependem de algo, com responsável e prazo SOMENTE se forem ditos.
- "insights": ideias, soluções, alternativas e boas observações levantadas na conversa.
- "tarefas_por_falante": para cada pessoa, o que ficou combinado que ela fará (tarefa, prazo se dito, e com quem foi combinado). Inclua só quem tem compromisso claro.
- "pontos_de_atencao": riscos, conflitos, dúvidas não resolvidas ou temas sensíveis que merecem atenção.
- Use sempre os nomes exatamente como aparecem nos rótulos de falante da transcrição.

CONTEXTO DA REUNIÃO
${contextBlock(c)}

TRANSCRIÇÃO
${transcriptText}`;
}

const STR = { type: "STRING" } as const;
const STR_LIST = { type: "ARRAY", items: STR } as const;
const obj = (properties: Record<string, unknown>) => ({ type: "OBJECT", properties, required: Object.keys(properties) });

export const TRANSCRIPTION_SCHEMA = obj({
  segmentos: { type: "ARRAY", items: obj({ inicio: STR, falante: STR, texto: STR }) },
});

export const ANALYSIS_SCHEMA = obj({
  titulo: STR,
  resumo_executivo: STR,
  participantes: { type: "ARRAY", items: obj({ nome: STR, papel: STR }) },
  topicos: { type: "ARRAY", items: obj({ titulo: STR, resumo: STR, falantes: STR_LIST }) },
  decisoes: { type: "ARRAY", items: obj({ decisao: STR, contexto: STR, responsaveis: STR_LIST }) },
  pendencias: { type: "ARRAY", items: obj({ descricao: STR, responsavel: STR, prazo: STR }) },
  insights: { type: "ARRAY", items: obj({ titulo: STR, descricao: STR }) },
  tarefas_por_falante: {
    type: "ARRAY",
    items: obj({ falante: STR, tarefas: { type: "ARRAY", items: obj({ descricao: STR, prazo: STR, combinado_com: STR }) } }),
  },
  pontos_de_atencao: STR_LIST,
});
