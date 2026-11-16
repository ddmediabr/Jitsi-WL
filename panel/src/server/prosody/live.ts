import "server-only";
import { z } from "zod";
import { prosodyCall } from "./client";

export type LiveParticipant = {
  name: string;
  kind: "registered" | "guest";
  user?: string;
  moderator: boolean;
  /** Papel da conta na sala segundo a política (só para cadastrados com acesso). */
  level?: "moderator" | "member";
  /** Usuário comum atuando como moderador interino (sem moderador real na sala). */
  interim?: boolean;
  /** Moderador que entrou no Modo invisível: ninguém na sala o vê, só o painel. */
  invisible?: boolean;
};
/** `elapsed`: segundos desde o início da sessão, calculados aqui no servidor (sem depender do relógio do navegador). */
export type LiveRoom = { name: string; participants: LiveParticipant[]; elapsed?: number };

// O encoder JSON do Prosody pode serializar uma tabela vazia como `{}` em vez de `[]`.
const emptyObjectAsList = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0 ? [] : v);

const schema = z.object({
  ok: z.literal(true),
  available: z.boolean(),
  rooms: z.preprocess(emptyObjectAsList, z.array(
    z.object({
      name: z.string().max(128),
      started: z.number().optional(),
      participants: z.preprocess(emptyObjectAsList, z.array(
        z.object({
          name: z.string().max(80),
          kind: z.enum(["registered", "guest"]),
          user: z.string().max(64).optional(),
          moderator: z.boolean(),
          level: z.enum(["moderator", "member"]).optional(),
          interim: z.boolean().optional(),
          invisible: z.boolean().optional(),
        }),
      )),
    }),
  )),
});

/**
 * Salas com reunião em andamento agora. `null` = o servidor não respondeu ou ainda não expõe esta
 * consulta (o painel mostra as salas cadastradas sem o estado ao vivo).
 */
export async function getLiveRooms(): Promise<LiveRoom[] | null> {
  try {
    const res = await prosodyCall("GET", "/rooms");
    if (res.status !== 200) {
      console.warn("[painel] GET /rooms respondeu", res.status);
      return null;
    }
    const parsed = schema.safeParse(res.json);
    if (!parsed.success) {
      console.warn("[painel] resposta de /rooms fora do esquema:", parsed.error.issues[0]?.path.join("."), parsed.error.issues[0]?.message);
      return null;
    }
    if (!parsed.data.available) {
      console.warn("[painel] servidor de reuniões sem a API de salas ativas (available=false)");
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    return (parsed.data.rooms as { name: string; started?: number; participants: LiveParticipant[] }[]).map((r) => ({
      name: r.name,
      participants: r.participants,
      elapsed: r.started ? Math.max(0, now - r.started) : undefined,
    }));
  } catch (error) {
    console.warn("[painel] falha ao consultar /rooms:", error instanceof Error ? error.message : "erro");
    return null;
  }
}
