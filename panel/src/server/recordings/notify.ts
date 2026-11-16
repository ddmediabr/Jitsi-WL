import "server-only";
import { eq } from "drizzle-orm";
import { dateFormatter } from "@/lib/tz";
import { audit } from "@/server/auth/audit";
import { buildRecordingMail } from "@/lib/mail-template";
import { mailConfigured, sendMail, type MailAttachment } from "@/server/auth/mail";
import { db } from "@/server/db";
import { jitsiProfiles, recordings } from "@/server/db/schema";
import { BRAND_DEFAULT, getSetting } from "@/server/settings";
import { getTimeZone } from "@/server/timezone";
import { docxOf, loadRun, txtOf } from "@/server/transcription/export";
import { downloadUrl, LINK_HOURS, signDownloadToken } from "./link";
import { getMailAccent, getMailTexts } from "./mail-template";

function durationText(sec: number | null): string {
  if (sec === null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : m > 0 ? `${m}min ${String(sec % 60).padStart(2, "0")}s` : `${sec}s`;
}

/**
 * Envia o link de download (válido por LINK_HOURS) para o e-mail da conta que iniciou a gravação.
 * Com `transcriptRunId`, anexa a transcrição (.txt) e a análise (.docx) daquela execução; com `transcriptFailed`, avisa que não foi possível gerá-las.
 * Sem iniciador, sem e-mail cadastrado ou sem Resend configurado: não envia (o painel continua baixando). Nunca lança erro.
 */
export async function emailRecordingLink(id: string, opts: { transcriptRunId?: string; transcriptFailed?: boolean } = {}): Promise<void> {
  try {
    if (!mailConfigured()) return;
    const [rec] = await db().select().from(recordings).where(eq(recordings.id, id)).limit(1);
    if (!rec?.initiator) return;
    const [profile] = await db().select({ email: jitsiProfiles.email, name: jitsiProfiles.displayName }).from(jitsiProfiles).where(eq(jitsiProfiles.username, rec.initiator)).limit(1);
    if (!profile?.email) return;

    const brand = (await getSetting("brand_name")) || BRAND_DEFAULT;
    const when = dateFormatter(await getTimeZone(), { dateStyle: "short", timeStyle: "short" }).format(rec.startedAt);
    const mb = rec.sizeBytes / 1024 ** 2;
    const size = mb >= 1024 ? `${(mb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB` : `${mb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
    const attachments: MailAttachment[] = [];
    let transcript: "ok" | "failed" | undefined = opts.transcriptFailed ? "failed" : undefined;
    if (opts.transcriptRunId) {
      const loaded = await loadRun(rec.id, opts.transcriptRunId);
      if (loaded) {
        attachments.push({ filename: `${loaded.base}_transcricao.txt`, content: Buffer.from(txtOf(loaded), "utf-8") }, { filename: `${loaded.base}_analise.docx`, content: await docxOf(loaded) });
        transcript = "ok";
      } else transcript = "failed";
    }
    const mail = buildRecordingMail({
      texts: await getMailTexts(),
      accent: await getMailAccent(),
      vars: { nome: profile.name, marca: brand, sala: rec.room, inicio: when, duracao: durationText(rec.durationSeconds), tamanho: size, horas: String(LINK_HOURS) },
      link: downloadUrl(signDownloadToken(rec.id)),
      transcript,
    });
    await sendMail(profile.email, mail.subject, mail.text, mail.html, attachments);
    await audit({ action: "recording.email", system: true, targetType: "recording", targetId: rec.id, details: { sala: rec.room, usuario: rec.initiator } });
  } catch (e) {
    // Sem o endereço de e-mail no log.
    console.warn("[recordings] e-mail do link não enviado:", e instanceof Error ? e.message.slice(0, 200) : "erro");
  }
}
