/**
 * Textos e ícones da página de entrada (o "hall" de salas). Módulo puro: roda no servidor (validação) e no navegador (contadores e seletor).
 * Os limites foram calculados para caber em até 3 linhas no desktop (média, não exata):
 *  - subtítulo: coluna do título com ~560 px, fonte de 18 px, ~52 caracteres por linha -> 150;
 *  - descrição da sala: cartão com ~330 px úteis, fonte de 14 px, ~44 caracteres por linha -> 130.
 */
export const HALL_TITLE_MAX = 30;
export const HALL_SUBTITLE_MAX = 150;
export const ROOM_DESCRIPTION_MAX = 130;
export const DEFAULT_HALL_TITLE = "Meeting Hall";

/** Ícones disponíveis para o cartão da sala (a chave é o que fica gravado no banco). */
export const ROOM_ICON_KEYS = ["door-open", "lock", "users", "key-round", "video", "briefcase", "building", "handshake", "presentation", "headset", "graduation-cap", "message-circle", "megaphone", "calendar", "shield-check", "star"] as const;
export type RoomIconKey = (typeof ROOM_ICON_KEYS)[number];
export const isRoomIcon = (v: unknown): v is RoomIconKey => (ROOM_ICON_KEYS as readonly string[]).includes(String(v));

export const ROOM_ICON_LABEL: Record<RoomIconKey, string> = {
  "door-open": "Porta",
  lock: "Cadeado",
  users: "Pessoas",
  "key-round": "Chave",
  video: "Vídeo",
  briefcase: "Maleta",
  building: "Empresa",
  handshake: "Acordo",
  presentation: "Apresentação",
  headset: "Atendimento",
  "graduation-cap": "Treinamento",
  "message-circle": "Conversa",
  megaphone: "Comunicado",
  calendar: "Agenda",
  "shield-check": "Segurança",
  star: "Destaque",
};

/** Uma linha só de texto (sem quebras nem espaços repetidos), cortada no limite. */
export const cleanLine = (value: unknown, max: number): string => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Como a pessoa entra na sala (das opções dela no painel; a mais restritiva vale): rótulo, texto e ícone padrão do cartão. */
export type RoomAccessKind = "exclusive" | "password" | "lobby" | "open";
export function accessOf(r: { exclusive: boolean; lobby: boolean; password: boolean }): { kind: RoomAccessKind; status: string; description: string; icon: RoomIconKey } {
  if (r.exclusive) return { kind: "exclusive", status: "Acesso restrito", description: "Sala exclusiva: só entra quem tem o acesso liberado.", icon: "lock" };
  if (r.password) return { kind: "password", status: "Entrada com senha", description: "Entre com a senha vigente da sala, sem esperar aprovação.", icon: "key-round" };
  if (r.lobby) return { kind: "lobby", status: "Entrada sob aprovação", description: "Você aguarda na sala de espera até um moderador liberar a entrada.", icon: "users" };
  return { kind: "open", status: "Entrada livre", description: "Qualquer pessoa com o endereço entra direto na reunião.", icon: "door-open" };
}
