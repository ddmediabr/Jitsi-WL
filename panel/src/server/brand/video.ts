import "server-only";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MAX_ENTRY_VIDEO_BYTES } from "@/lib/brand";

/**
 * Vídeo de fundo das páginas de entrada. A pessoa envia um MP4 de até 10 MB; o painel o CONVERTE com o ffmpeg:
 * corta em 8 s (com uma transição de 1 s do fim para o começo, para o laço não ter emenda), limita a 1920 x 1080,
 * 24 fps, tira o áudio e comprime até 3 MB (duas passadas, com o bitrate calculado pelo tamanho-alvo).
 * Um arquivo que já está no padrão (até 8,5 s, 3 MB, 1080p, sem áudio, H.264) passa sem ser recodificado.
 * O tipo vem do CONTEÚDO (caixa "ftyp"), o ffmpeg roda sem acesso à rede, com tempo limite e um de cada vez.
 */
export const MAX_VIDEO_BYTES = MAX_ENTRY_VIDEO_BYTES;
export const TARGET_BYTES = 3 * 1024 * 1024; // 3 MB (MiB)
export const LOOP_SECONDS = 8;
const MIN_SECONDS = 2;
const MAX_INPUT_SECONDS = 180;
const MAX_INPUT_WIDTH = 3840;
const MAX_INPUT_HEIGHT = 2160;
const PASS_TIMEOUT_MS = 150_000;

export type VideoResult = { ok: true; data: Buffer; mime: string } | { ok: false; error: string };

const BRANDS = new Set(["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "M4V "]);

type Meta = { seconds: number; width: number; height: number; h264: boolean; hasAudio: boolean; fragmented: boolean };

const VIDEO_ENTRIES = new Set(["avc1", "avc3", "hvc1", "hev1", "av01", "vp09", "mp4v"]);

/**
 * Lê duração, resolução, codec e a presença de áudio direto das caixas do MP4 (sem ffprobe).
 * A resolução e o codec vêm da caixa "stsd" (descrição das amostras) da faixa de vídeo: procurar só pela palavra "avc1" erra,
 * porque ela também aparece na lista de marcas do início do arquivo ("ftyp").
 */
function readMeta(input: Buffer): Meta | null {
  const mvhd = input.indexOf("mvhd", 0, "latin1");
  if (mvhd < 0 || mvhd + 36 > input.length) return null;
  const version = input[mvhd + 4];
  const timescale = version === 1 ? input.readUInt32BE(mvhd + 24) : input.readUInt32BE(mvhd + 16);
  const duration = version === 1 ? Number(input.readBigUInt64BE(mvhd + 28)) : input.readUInt32BE(mvhd + 20);
  if (!timescale) return null;

  let width = 0;
  let height = 0;
  let h264 = false;
  for (let at = input.indexOf("stsd", 0, "latin1"); at >= 0; at = input.indexOf("stsd", at + 4, "latin1")) {
    // stsd: versão/flags (4) + contagem (4) + primeira entrada: tamanho (4), tipo (4) ...
    if (at + 16 + 4 + 28 + 4 > input.length) break;
    const type = input.subarray(at + 16, at + 20).toString("latin1");
    if (!VIDEO_ENTRIES.has(type)) continue;
    width = input.readUInt16BE(at + 16 + 28);
    height = input.readUInt16BE(at + 16 + 30);
    h264 = type === "avc1" || type === "avc3";
    break;
  }
  return { seconds: duration / timescale, width, height, h264, hasAudio: input.indexOf("soun", 0, "latin1") >= 0, fragmented: input.indexOf("moof", 0, "latin1") >= 0 };
}

const run = (file: string, args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout: PASS_TIMEOUT_MS, maxBuffer: 1024 * 1024, killSignal: "SIGKILL" }, (err) => (err ? reject(err) : resolve()));
  });

// Um vídeo de cada vez: a conversão usa bastante CPU e o painel não pode travar.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = chain.then(job, job);
  chain = next.catch(() => undefined);
  return next;
}

const BASE_FILTER =
  "fps=24,scale=w=min(1920\\,iw):h=min(1080\\,ih):force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p";
// 9 s de origem -> 1 s de transição (fim para o começo) + 7 s do meio = 8 s em laço.
const LOOP_FILTER = `[0:v]${BASE_FILTER},split=3[a][b][c];[a]trim=8:9,setpts=PTS-STARTPTS[t1];[b]trim=0:1,setpts=PTS-STARTPTS[t2];[t1][t2]xfade=transition=fade:duration=1:offset=0[x];[c]trim=1:8,setpts=PTS-STARTPTS[m];[x][m]concat=n=2:v=1:a=0[o]`;

async function convert(input: Buffer, meta: Meta): Promise<VideoResult> {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const dir = await mkdtemp(path.join(tmpdir(), `bg-${randomBytes(4).toString("hex")}-`));
  const src = path.join(dir, "in.mp4");
  const out = path.join(dir, "out.mp4");
  const log = path.join(dir, "pass");
  try {
    await writeFile(src, input);
    const loop = meta.seconds >= LOOP_SECONDS + 1;
    const outSeconds = loop || meta.seconds > LOOP_SECONDS ? LOOP_SECONDS : meta.seconds;
    const common = ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-protocol_whitelist", "file", "-threads", "2"];
    const inputArgs = ["-i", src, "-t", loop ? "9" : String(outSeconds)];
    const filterArgs = loop ? ["-filter_complex", LOOP_FILTER, "-map", "[o]"] : ["-vf", BASE_FILTER];

    let kbps = Math.max(300, Math.floor(((TARGET_BYTES * 8) / outSeconds) * 0.92 / 1000));
    for (let attempt = 0; attempt < 3; attempt++) {
      const enc = ["-an", ...filterArgs, "-c:v", "libx264", "-preset", "slow", "-b:v", `${kbps}k`, "-passlogfile", log];
      await run(ffmpeg, [...common, ...inputArgs, ...enc, "-pass", "1", "-f", "null", "-"]);
      await run(ffmpeg, [...common, ...inputArgs, ...enc, "-pass", "2", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
      const size = (await stat(out)).size;
      if (size <= TARGET_BYTES) {
        const data = await readFile(out);
        return { ok: true, data, mime: "video/mp4" };
      }
      kbps = Math.floor(kbps * (TARGET_BYTES / size) * 0.9); // ficou maior que 3 MB: tenta de novo com menos bitrate
    }
    return { ok: false, error: "Não foi possível comprimir o vídeo até 3 MB. Tente um vídeo com menos movimento ou menor." };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { ok: false, error: "A conversão de vídeo não está disponível neste servidor." };
    return { ok: false, error: "Não foi possível converter o vídeo. Ele pode estar corrompido ou em um formato não suportado." };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * MP4 fragmentado (comum em vídeos de bancos de imagem e de streaming) traz duração 0 na caixa "mvhd". Nesse caso, o ffmpeg lê o arquivo
 * ("ffmpeg -i" escreve duração, codec e resolução no stderr, mesmo terminando com erro por não ter saída).
 */
async function probeWithFfmpeg(input: Buffer): Promise<Meta | null> {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const dir = await mkdtemp(path.join(tmpdir(), `probe-${randomBytes(4).toString("hex")}-`));
  try {
    const src = path.join(dir, "in.mp4");
    await writeFile(src, input);
    const text = await new Promise<string>((resolve) => {
      execFile(ffmpeg, ["-nostdin", "-hide_banner", "-protocol_whitelist", "file", "-i", src], { timeout: 20_000, maxBuffer: 1024 * 1024 }, (_err, stdout, stderr) => resolve(String(stdout) + "\n" + String(stderr)));
    });
    const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
    if (!d) return null;
    const seconds = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]);
    const videoLine = text.split("\n").find((l) => /Stream #.*Video:/.test(l))?.replace(/\([^)]*\)/g, "") ?? "";
    const dims = /,\s*(\d{2,5})x(\d{2,5})[\s,[]/.exec(videoLine);
    return {
      seconds,
      width: dims ? Number(dims[1]) : 0,
      height: dims ? Number(dims[2]) : 0,
      h264: /Video:\s*h264/.test(videoLine),
      hasAudio: /Stream #.*Audio:/.test(text),
      fragmented: true,
    };
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function processEntryVideo(input: Buffer): Promise<VideoResult> {
  if (input.length === 0) return { ok: false, error: "Nenhum arquivo enviado." };
  if (input.length > MAX_VIDEO_BYTES) return { ok: false, error: `O vídeo deve ter no máximo ${MAX_VIDEO_BYTES / 1024 / 1024} MB.` };
  if (input.length < 32 || input.subarray(4, 8).toString("latin1") !== "ftyp" || !BRANDS.has(input.subarray(8, 12).toString("latin1"))) {
    return { ok: false, error: "Formato não aceito. Envie um vídeo MP4." };
  }
  let meta = readMeta(input);
  if (!meta || meta.seconds <= 0) meta = await probeWithFfmpeg(input);
  if (!meta || meta.seconds <= 0) return { ok: false, error: "Não foi possível ler a duração do vídeo. Ele pode estar corrompido." };
  if (meta.seconds < MIN_SECONDS) return { ok: false, error: `O vídeo é curto demais (mínimo ${MIN_SECONDS} segundos).` };
  if (meta.seconds > MAX_INPUT_SECONDS) return { ok: false, error: `O vídeo é longo demais (máximo ${MAX_INPUT_SECONDS} segundos).` };
  if (meta.width > MAX_INPUT_WIDTH || meta.height > MAX_INPUT_HEIGHT) return { ok: false, error: `Resolução máxima de envio: ${MAX_INPUT_WIDTH} x ${MAX_INPUT_HEIGHT}.` };

  // Já está no padrão: não recodifica (cada recompressão perde qualidade).
  if (meta.h264 && !meta.hasAudio && !meta.fragmented && meta.seconds <= LOOP_SECONDS + 0.5 && input.length <= TARGET_BYTES && meta.width <= 1920 && meta.height <= 1080) {
    return { ok: true, data: input, mime: "video/mp4" };
  }
  return serial(() => convert(input, meta));
}
