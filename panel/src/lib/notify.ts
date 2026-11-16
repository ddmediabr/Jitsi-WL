import { toast } from "sonner";

/**
 * Camada de notificações do produto. Toda notificação passa por aqui, de modo que o comportamento
 * (agrupar, limitar, tempo) fica em UM lugar e pode ser ajustado por marca (white label).
 *
 * Desempenho: salas grandes disparam muitos eventos. Entradas, saídas e mãos levantadas são
 * AGRUPADAS numa janela curta e viram um único aviso (id fixo: o novo substitui o anterior),
 * então o número de avisos na tela nunca cresce com o tamanho da sala.
 */

const BURST_MS = 1500;
const MAX_NAMES = 3;

type Burst = { names: string[]; count: number; timer: number | null };

const bursts: { id: string; cancel: () => void }[] = [];

function makeBurst(id: string, text: (names: string[], count: number) => string) {
  const burst: Burst = { names: [], count: 0, timer: null };
  const cancel = () => {
    if (burst.timer !== null) window.clearTimeout(burst.timer);
    burst.names = [];
    burst.count = 0;
    burst.timer = null;
    toast.dismiss(id);
  };
  bursts.push({ id, cancel });
  return (name: string) => {
    burst.count += 1;
    if (burst.names.length < MAX_NAMES) burst.names.push(name);
    if (burst.timer !== null) return;
    burst.timer = window.setTimeout(() => {
      toast.info(text(burst.names, burst.count), { id });
      burst.names = [];
      burst.count = 0;
      burst.timer = null;
    }, BURST_MS);
  };
}

/** "Ana entrou", "Ana e Bruno entraram", "Ana, Bruno e mais 4 entraram". */
function who(names: string[], count: number, one: string, many: string): string {
  if (count === 1) return `${names[0]} ${one}`;
  if (count === 2) return `${names[0]} e ${names[1]} ${many}`;
  return `${names.slice(0, 2).join(", ")} e mais ${count - 2} ${many}`;
}

const joined = makeBurst("presence-joined", (n, c) => who(n, c, "entrou", "entraram"));
const left = makeBurst("presence-left", (n, c) => who(n, c, "saiu", "saíram"));
const hands = makeBurst("hands-raised", (n, c) =>
  c === 1 ? `${n[0]} levantou a mão` : who(n, c, "levantou a mão", "levantaram a mão"),
);

const UNMUTE_ID = "unmute-invite";

export const notify = {
  /** Cancela avisos de entrada/saída/mão pendentes (ex.: eu saí e o Jitsi anuncia a saída de todos). */
  cancelPresence: () => bursts.forEach((b) => b.cancel()),
  joined,
  left,
  handRaised: hands,
  /** `id` evita pilha: o mesmo aviso repetido substitui o anterior. */
  info: (message: string, description?: string, id?: string) =>
    toast.info(message, { description, id }),
  error: (message: string, description?: string, id?: string) =>
    toast.error(message, { description, id }),

  /** Quem foi removido já gera o aviso próprio; o "saiu" dele seria repetido. */
  removed: (name: string) => toast.info(`${name} foi removido da sala`, { id: "removed" }),

  /** Gravação da reunião: todos os participantes são avisados ao ligar (inclusive quem entra com ela já ligada) e ao desligar. */
  recordingStarted: () =>
    toast("Esta reunião está sendo gravada", { id: "recording-state", description: "Áudio e vídeo estão sendo registrados.", duration: 9000 }),
  recordingStopped: () => toast.info("A gravação foi encerrada", { id: "recording-state", duration: 6000 }),

  /** Tentou ligar o microfone com o Modo Apresentador ligado. */
  micBlocked: (onRaiseHand: () => void) =>
    toast.info("Seu microfone está bloqueado pelo moderador", {
      id: "mic-blocked",
      description: "Levante a mão para pedir a palavra.",
      duration: 8000,
      action: { label: "Levantar a mão", onClick: onRaiseHand },
    }),

  /** Pedido de entrada na sala (moderador). Um aviso por pessoa; o painel tem a lista completa. */
  knocking: (id: string, name: string, onOpen: () => void) =>
    toast.info(`${name} quer entrar`, {
      id: `knock-${id}`,
      duration: 8000,
      action: { label: "Ver", onClick: onOpen },
    }),

  /** O moderador pediu (ou liberou) para ligar o microfone. Some sozinho em 8 s. */
  unmuteInvite: (title: string, description?: string, onUnmute?: () => void, actionLabel = "Ligar microfone") =>
    toast(title, {
      id: UNMUTE_ID,
      description,
      duration: 8000,
      action: onUnmute ? { label: actionLabel, onClick: onUnmute } : undefined,
    }),
  dismissUnmuteInvite: () => toast.dismiss(UNMUTE_ID),
};
