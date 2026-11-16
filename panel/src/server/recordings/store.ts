import "server-only";
import path from "node:path";
import { env } from "@/server/env";

/** Pasta das gravações (volume persistente). */
export function recordingsDir(): string {
  return env().RECORDINGS_DIR;
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Caminho do arquivo de uma gravação. O id vem do banco, mas confere o formato: nunca monta caminho com texto livre. */
export function recordingPath(id: string): string {
  if (!ID.test(id)) throw new Error("id de gravação inválido");
  return path.join(recordingsDir(), `${id}.mp4`);
}

export function recordingPartPath(id: string): string {
  if (!ID.test(id)) throw new Error("id de gravação inválido");
  return path.join(recordingsDir(), `${id}.part`);
}
