import "server-only";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Duração (segundos) e se há trilha de áudio, lidas do arquivo (ffprobe). */
export async function probeAudio(path: string): Promise<{ seconds: number; hasAudio: boolean }> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", path], { timeout: 60_000 });
  const j = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string }[] };
  return { seconds: Number(j.format?.duration ?? 0) || 0, hasAudio: (j.streams ?? []).some((s) => s.codec_type === "audio") };
}

/**
 * Extrai só o áudio do mp4: mono, 16 kHz, mp3 de 32 kbps (cerca de 13 MB por hora). O Gemini reduz o áudio para 16 kbps de qualquer
 * forma, então não há ganho em enviar mais. `part` corta um trecho (usado em reuniões muito longas).
 */
export async function extractAudio(input: string, output: string, part?: { start: number; length: number }): Promise<void> {
  const args = ["-v", "error", "-y", ...(part ? ["-ss", String(part.start), "-t", String(part.length)] : []), "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k", output];
  await run("ffmpeg", args, { timeout: 15 * 60_000 });
  // Valida antes de gastar uma chamada da API: um arquivo vazio ou minúsculo não tem o que transcrever.
  const size = (await stat(output)).size;
  if (size < 2048) throw new Error("O áudio extraído é pequeno demais (gravação sem som?).");
}
