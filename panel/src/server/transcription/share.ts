import "server-only";
import { renderMail } from "@/lib/mail-template";
import { sendMail } from "@/server/auth/mail";
import { getMailColor } from "@/server/recordings/mail-template";
import { BRAND_DEFAULT, getSetting } from "@/server/settings";
import { docxOf, loadRun, txtOf } from "./export";
import { createZip } from "./zip";

/** Envia por e-mail um .zip com a transcrição (.txt) e a análise (.docx) de uma execução concluída. */
export async function emailTranscriptZip(recordingId: string, runId: string, to: string): Promise<{ ok: true; room: string } | { ok: false; error: string }> {
  const loaded = await loadRun(recordingId, runId);
  if (!loaded) return { ok: false, error: "Esta transcrição não está pronta." };
  const [brandSetting, color] = await Promise.all([getSetting("brand_name"), getMailColor()]);
  const brand = brandSetting || BRAND_DEFAULT;
  const zip = createZip([
    { name: `${loaded.base}_transcricao.txt`, data: Buffer.from(txtOf(loaded), "utf-8") },
    { name: `${loaded.base}_analise.docx`, data: await docxOf(loaded) },
  ]);
  const { text, html } = renderMail({
    brand,
    color,
    title: "Transcrição e análise da reunião",
    paragraphs: [`Seguem em anexo, em um arquivo .zip, a transcrição na íntegra (.txt) e a análise da reunião (.docx) da sala ${loaded.rec.room}.`],
    details: [
      ["Sala", loaded.rec.room],
      ["Início", loaded.meta.when],
    ],
    footer: "Este e-mail foi enviado por um administrador do painel.",
  });
  await sendMail(to, `${brand}: transcrição da sala ${loaded.rec.room}`, text, html, [{ filename: `${loaded.base}_transcricao.zip`, content: zip }]);
  return { ok: true, room: loaded.rec.room };
}
