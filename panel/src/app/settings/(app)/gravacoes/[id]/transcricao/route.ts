import { audit } from "@/server/auth/audit";
import { requireFullAuth } from "@/server/auth/dal";
import { docxOf, loadRun, txtOf } from "@/server/transcription/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Baixa a transcrição (.txt) ou a análise (.docx) de uma gravação. ?tipo=txt|docx e, opcional, ?execucao=<id> (senão, a mais recente concluída). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireFullAuth("admin");
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo") === "docx" ? "docx" : "txt";
  const runId = url.searchParams.get("execucao");
  if (!ID.test(id) || (runId !== null && !ID.test(runId))) return new Response("Não encontrado", { status: 404 });

  const loaded = await loadRun(id, runId);
  if (!loaded) return new Response("Esta gravação ainda não tem transcrição pronta.", { status: 404 });

  await audit({ action: "transcript.download", actorId: admin.id, actorLabel: admin.username, targetType: "recording", targetId: id, details: { sala: loaded.rec.room, tipo, modelo: loaded.run.modelAnalyze ?? loaded.run.modelTranscribe } });
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (tipo === "docx") {
    const data = await docxOf(loaded);
    return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Type": DOCX, "Content-Disposition": `attachment; filename="${loaded.base}_analise.docx"` } });
  }
  return new Response(txtOf(loaded), { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${loaded.base}_transcricao.txt"` } });
}
