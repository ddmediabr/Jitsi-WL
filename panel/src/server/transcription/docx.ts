import "server-only";
import { AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageNumber, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, type FileChild } from "docx";
import { modelLabel, type Analysis } from "@/lib/transcription";
import type { DocMeta } from "./format";

/** Modelo padrão do documento de análise: capa com a marca e seções fixas (Resumo, Participantes, Tópicos, Decisões, Pendências, Insights, Tarefas por pessoa, Pontos de atenção). */
export type DocxInput = {
  meta: DocMeta;
  analysis: Analysis;
  /** Logo já em PNG (a biblioteca não aceita WebP) e suas medidas em pixels; null = só o nome da marca. */
  logo: { data: Buffer; width: number; height: number } | null;
  /** Cor de destaque (#RRGGBB). */
  accent: string;
};

const FONT = "Calibri";
const GREY = "595959";
const run = (text: string, o: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}) =>
  new TextRun({ text, font: FONT, bold: o.bold, size: o.size, color: o.color, italics: o.italics });

const para = (text: string, o: { bold?: boolean; size?: number; color?: string; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; italics?: boolean } = {}) =>
  new Paragraph({ alignment: o.align, spacing: { after: o.after ?? 120, line: 300 }, children: [run(text, o)] });

const bullet = (text: string, lead?: string) =>
  new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 300 }, children: [...(lead ? [run(`${lead} `, { bold: true })] : []), run(text)] });

const empty = (n = 1) => Array.from({ length: n }, () => new Paragraph({ children: [] }));

function sectionTitle(num: number, title: string, accent: string): Paragraph {
  return new Paragraph({
    spacing: { before: 360, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: accent, space: 4 } },
    keepNext: true,
    children: [run(`${num}. ${title}`, { bold: true, size: 30, color: accent })],
  });
}

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const LINE = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" } as const;

function cell(text: string, o: { bold?: boolean; fill?: string; width: number; color?: string }): TableCell {
  return new TableCell({
    width: { size: o.width, type: WidthType.PERCENTAGE },
    shading: o.fill ? { type: ShadingType.CLEAR, fill: o.fill, color: "auto" } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    borders: { top: LINE, bottom: LINE, left: LINE, right: LINE },
    children: [new Paragraph({ spacing: { after: 0, line: 280 }, children: [run(text || "—", { bold: o.bold, size: 21, color: o.color })] })],
  });
}

function table(headers: string[], widths: number[], rows: string[][], accent: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { bold: true, fill: accent, color: "FFFFFF", width: widths[i] })) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => cell(t, { width: widths[i] })) })),
    ],
  });
}

function infoTable(rows: [string, string][], accent: string): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: LINE, insideVertical: NONE },
    rows: rows.map(
      ([k, v]) =>
        new TableRow({
          children: [
            new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, margins: { top: 100, bottom: 100, left: 60, right: 120 }, borders: { top: NONE, bottom: LINE, left: NONE, right: NONE }, children: [new Paragraph({ children: [run(k, { bold: true, color: accent, size: 22 })] })] }),
            new TableCell({ width: { size: 72, type: WidthType.PERCENTAGE }, margins: { top: 100, bottom: 100, left: 120, right: 60 }, borders: { top: NONE, bottom: LINE, left: NONE, right: NONE }, children: [new Paragraph({ children: [run(v || "—", { size: 22 })] })] }),
          ],
        }),
    ),
  });
}

export async function buildAnalysisDocx(input: DocxInput): Promise<Buffer> {
  const { meta, analysis: a, logo } = input;
  const accent = input.accent.replace("#", "").toUpperCase();
  const names = [...new Set([...a.participantes.map((p) => p.nome), ...a.tarefas_por_falante.map((t) => t.falante)])].filter(Boolean);

  // ---- capa ----
  const cover: FileChild[] = [
    ...empty(logo ? 2 : 4),
    ...(logo
      ? [new Paragraph({ spacing: { after: 240 }, children: [new ImageRun({ type: "png", data: logo.data, transformation: { width: logo.width, height: logo.height } })] })]
      : [new Paragraph({ spacing: { after: 240 }, children: [run(meta.brand, { bold: true, size: 40, color: accent })] })]),
    new Paragraph({ spacing: { before: 600, after: 120 }, children: [run("ATA E ANÁLISE DA REUNIÃO", { bold: true, size: 56, color: accent })] }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: accent, space: 6 } }, spacing: { after: 360 }, children: [run(a.titulo || `Reunião da sala ${meta.room}`, { size: 30, color: GREY })] }),
    infoTable(
      [
        ["Organização", meta.brand],
        ["Sala", meta.room],
        ["Data e hora", meta.when],
        ["Duração", meta.duration],
        ["Gravação iniciada por", meta.initiator ?? ""],
        ["Participantes", names.join(", ")],
      ],
      accent,
    ),
    ...empty(3),
    para(`Documento gerado automaticamente por inteligência artificial (${modelLabel(meta.model)}) a partir da gravação da reunião. Revise o conteúdo antes de usá-lo como registro oficial.`, { size: 18, color: GREY, italics: true }),
  ];

  // ---- conteúdo ----
  const body: FileChild[] = [];
  let n = 0;
  const section = (title: string) => body.push(sectionTitle(++n, title, accent));
  const none = (text = "Nada a registrar.") => body.push(para(text, { color: GREY, italics: true }));

  section("Resumo executivo");
  if (a.resumo_executivo.trim()) for (const p of a.resumo_executivo.split(/\n{1,}/).filter(Boolean)) body.push(para(p));
  else none();

  section("Participantes");
  if (a.participantes.length) body.push(table(["Nome", "Papel ou participação"], [35, 65], a.participantes.map((p) => [p.nome, p.papel]), accent));
  else none();

  section("Tópicos discutidos");
  if (a.topicos.length)
    a.topicos.forEach((t, i) => {
      body.push(new Paragraph({ spacing: { before: 200, after: 80 }, keepNext: true, children: [run(`${i + 1}. ${t.titulo}`, { bold: true, size: 24 })] }));
      body.push(para(t.resumo));
      if (t.falantes.length) body.push(para(`Quem participou: ${t.falantes.join(", ")}`, { size: 20, color: GREY, italics: true }));
    });
  else none();

  section("Decisões tomadas");
  if (a.decisoes.length)
    for (const d of a.decisoes) {
      body.push(bullet(d.decisao, "Decisão:"));
      if (d.contexto) body.push(para(d.contexto, { size: 21, color: GREY, after: 40 }));
      if (d.responsaveis.length) body.push(para(`Responsáveis: ${d.responsaveis.join(", ")}`, { size: 21, color: GREY }));
    }
  else none("Nenhuma decisão formal foi identificada.");

  section("Pendências");
  if (a.pendencias.length) body.push(table(["Pendência", "Responsável", "Prazo"], [58, 22, 20], a.pendencias.map((p) => [p.descricao, p.responsavel, p.prazo]), accent));
  else none("Nenhuma pendência foi identificada.");

  section("Insights e soluções propostas");
  if (a.insights.length) for (const i of a.insights) body.push(bullet(i.descricao, `${i.titulo}:`));
  else none();

  section("Divisão de tarefas por pessoa");
  if (a.tarefas_por_falante.some((t) => t.tarefas.length))
    for (const t of a.tarefas_por_falante.filter((x) => x.tarefas.length)) {
      body.push(new Paragraph({ spacing: { before: 200, after: 80 }, keepNext: true, children: [run(t.falante, { bold: true, size: 24, color: accent })] }));
      body.push(table(["O que ficou combinado", "Prazo", "Combinado com"], [60, 18, 22], t.tarefas.map((x) => [x.descricao, x.prazo, x.combinado_com]), accent));
    }
  else none("Nenhuma tarefa individual foi atribuída.");

  section("Pontos de atenção");
  if (a.pontos_de_atencao.length) for (const p of a.pontos_de_atencao) body.push(bullet(p));
  else none();

  const doc = new Document({
    creator: meta.brand,
    title: `Ata e análise — ${meta.room}`,
    description: "Gerado automaticamente por IA",
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      { properties: { page: { margin: { top: 1134, bottom: 1134, left: 1304, right: 1304 } } }, children: cover },
      {
        properties: { page: { margin: { top: 1304, bottom: 1134, left: 1304, right: 1304 } } },
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(`${meta.brand} · ${meta.room} · ${meta.when}`, { size: 18, color: GREY })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ font: FONT, size: 18, color: GREY, children: ["Página ", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES] })] })] }) },
        children: body,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
