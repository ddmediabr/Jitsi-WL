/**
 * Ponte com a IFrame API do Jitsi (external_api.js).
 * O Jitsi responde no MESMO domínio desta página; o Traefik separa os pedidos.
 * Em desenvolvimento local, defina NEXT_PUBLIC_JITSI_DOMAIN=<domínio da instalação>.
 */

export type JitsiApi = {
  executeCommand: (command: string, ...args: unknown[]) => void;
  addListener: (event: string, listener: (payload: unknown) => void) => void;
  getIFrame?: () => HTMLIFrameElement;
  dispose: () => void;
};

type JitsiConstructor = new (
  domain: string,
  options: Record<string, unknown>,
) => JitsiApi;

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiConstructor;
  }
}

export function jitsiDomain(): string {
  return process.env.NEXT_PUBLIC_JITSI_DOMAIN || window.location.host;
}

/** Nomes de sala aceitos: letras, números, "_" e "-" (até 64). */
const ROOM_PATTERN = /^[\p{L}\p{N}_-]{1,64}$/u;

export function parseRoom(pathname: string | null): string | null {
  if (!pathname) return null;
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(first);
  } catch {
    return null;
  }
  return ROOM_PATTERN.test(decoded) ? decoded : null;
}

export function cleanDisplayName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 60);
}

export type WaitingParticipant = { id: string; name: string };

export type LobbyState = {
  /** Este cliente está na sala de espera aguardando aprovação. */
  knocking: boolean;
  passwordJoinFailed: boolean;
  /** O Jitsi mostrou "pedido recusado" para este cliente. */
  rejected: boolean;
  /** Para moderadores: quem está aguardando (lista oficial do Jitsi). */
  waiting: WaitingParticipant[];
};

type JitsiWindow = Window & {
  APP?: {
    store?: { getState: () => Record<string, unknown>; dispatch?: (action: unknown) => unknown; subscribe?: (listener: () => void) => () => void };
  };
};

type JitsiState = Record<string, unknown>;

/**
 * Estado interno (redux) do Jitsi dentro do iframe.
 * Só funciona porque o iframe está na MESMA origem desta página, e depende de
 * partes internas do Jitsi (versão fixada: stable-11248-3). Se algo mudar,
 * devolve null e o fluxo usa os eventos e mensagens genéricas.
 */
function jitsiState(api: JitsiApi): JitsiState | null {
  try {
    const win = api.getIFrame?.()?.contentWindow as JitsiWindow | null | undefined;
    return win?.APP?.store?.getState() ?? null;
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export type RoomParticipant = {
  id: string;
  name: string;
  moderator: boolean;
  /** null = ainda sem informação do Jitsi. */
  audioMuted: boolean | null;
  videoMuted: boolean | null;
  /** Está com a mão levantada (pedindo a palavra). */
  handRaised: boolean;
  /** Está compartilhando a tela agora. */
  sharing: boolean;
};

/** Participantes remotos da sala, com o estado de microfone e câmera. */
export function readParticipants(api: JitsiApi): RoomParticipant[] | null {
  const state = jitsiState(api);
  const remote = asObject(state?.["features/base/participants"]).remote as
    | { entries?: () => Iterable<[string, unknown]> }
    | undefined;
  // O Map vive no "mundo" JS do iframe: `instanceof Map` falharia, então checamos o formato.
  if (!remote || typeof remote.entries !== "function") return null;
  const entries = Array.from(remote.entries());

  const tracks = Array.isArray(state?.["features/base/tracks"])
    ? (state?.["features/base/tracks"] as unknown[]).map(asObject)
    : [];
  const mutedOf = (id: string, media: "audio" | "video"): boolean | null => {
    // A câmera não se confunde com a faixa da tela compartilhada (também é "video").
    const t = tracks.find((x) => x.participantId === id && x.mediaType === media && !x.local && x.videoType !== "desktop");
    return t && typeof t.muted === "boolean" ? t.muted : null;
  };
  const isSharing = (id: string): boolean => tracks.some((x) => x.participantId === id && !x.local && x.videoType === "desktop" && x.muted !== true);

  const list: RoomParticipant[] = [];
  for (const [id, raw] of entries) {
    const p = asObject(raw);
    if (p.fakeParticipant || p.isFakeParticipant) continue; // ex.: vídeo compartilhado
    list.push({
      id,
      name: typeof p.name === "string" && p.name ? p.name : "Participante",
      moderator: p.role === "moderator",
      audioMuted: mutedOf(id, "audio"),
      videoMuted: mutedOf(id, "video"),
      handRaised: Boolean(p.raisedHandTimestamp),
      sharing: isSharing(id),
    });
  }
  return list;
}

/** Silencia (áudio) ou para a câmera (vídeo) de UM participante, pelo método nativo do Jitsi. */
export function muteParticipant(
  api: JitsiApi,
  participantId: string,
  media: "audio" | "video" | "screenshare",
): boolean {
  try {
    const conference = asObject(asObject(jitsiState(api)?.["features/base/conference"]).conference);
    const fn = conference.muteParticipant;
    if (typeof fn !== "function") return false;
    (fn as (id: string, media: string) => void).call(conference, participantId, media);
    return true;
  } catch {
    return false;
  }
}

export type AudioModeration = {
  /** Moderação de áudio ligada: ninguém liga o próprio microfone sem o moderador liberar. */
  enabled: boolean;
  /** Participantes que tentaram ligar o microfone e aguardam liberação (pedidos de fala). */
  pending: string[];
  /** Participantes já liberados pelo moderador. */
  approved: string[];
};

/** Estado da moderação de áudio nativa do Jitsi (features/av-moderation). */
export function readAudioModeration(api: JitsiApi): AudioModeration | null {
  const mod = asObject(jitsiState(api)?.["features/av-moderation"]);
  if (typeof mod.audioModerationEnabled !== "boolean") return null;

  const pending: string[] = [];
  if (Array.isArray(mod.pendingAudio)) {
    for (const item of mod.pendingAudio) {
      const id = typeof item === "string" ? item : asObject(item).id;
      if (typeof id === "string") pending.push(id);
    }
  }
  return {
    enabled: mod.audioModerationEnabled,
    pending,
    // Ao rejeitar, o Jitsi grava `false` (não apaga a chave): só `true` conta como liberado.
    approved: Object.entries(asObject(mod.audioWhitelist))
      .filter(([, v]) => v === true)
      .map(([id]) => id),
  };
}

/** Liga/desliga a moderação de áudio (comando nativo `toggleModeration`). */
export function setAudioModeration(api: JitsiApi, enabled: boolean): void {
  api.executeCommand("toggleModeration", enabled, "audio");
}

/** Moderação de câmera e de compartilhamento de tela (mesmo mecanismo da de áudio: bloqueado até o moderador liberar). */
export type MediaKind = "video" | "desktop";
export type MediaModeration = Record<MediaKind, { enabled: boolean; pending: string[]; approved: string[] }>;

/** Estado da moderação de câmera e de compartilhamento (features/av-moderation). null = sem informação. */
export function readMediaModeration(api: JitsiApi): MediaModeration | null {
  const mod = asObject(jitsiState(api)?.["features/av-moderation"]);
  if (typeof mod.videoModerationEnabled !== "boolean" || typeof mod.desktopModerationEnabled !== "boolean") return null;
  const pendingOf = (list: unknown): string[] => {
    const ids: string[] = [];
    if (Array.isArray(list)) {
      for (const item of list) {
        const id = typeof item === "string" ? item : asObject(item).id;
        if (typeof id === "string") ids.push(id);
      }
    }
    return ids;
  };
  const approvedOf = (list: unknown): string[] =>
    Object.entries(asObject(list))
      .filter(([, v]) => v === true)
      .map(([id]) => id);
  return {
    video: { enabled: mod.videoModerationEnabled, pending: pendingOf(mod.pendingVideo), approved: approvedOf(mod.videoWhitelist) },
    desktop: { enabled: mod.desktopModerationEnabled, pending: pendingOf(mod.pendingDesktop), approved: approvedOf(mod.desktopWhitelist) },
  };
}

/** Liga/desliga a moderação de câmera ou de compartilhamento (métodos nativos da conferência, os mesmos do menu do Jitsi). */
export function setMediaModeration(api: JitsiApi, kind: MediaKind, enabled: boolean): void {
  try {
    const conference = conferenceOf(api);
    const fn = enabled ? conference.enableAVModeration : conference.disableAVModeration;
    if (typeof fn === "function") (fn as (media: string) => void).call(conference, kind);
  } catch {
    /* sem o método, o botão simplesmente não age */
  }
}

/** Volta a bloquear a câmera ou o compartilhamento de UM participante: revoga a liberação (`avModerationReject`) e encerra o que estiver ligado. */
export function blockMedia(api: JitsiApi, kind: MediaKind, participantId: string): void {
  try {
    const conference = conferenceOf(api);
    const fn = conference.avModerationReject;
    if (typeof fn === "function") (fn as (media: string, id: string) => void).call(conference, kind, participantId);
  } catch {
    /* ignora */
  }
  muteParticipant(api, participantId, kind === "video" ? "video" : "screenshare");
}

/** Libera a câmera ou o compartilhamento de UM participante (método nativo `avModerationApprove`). */
export function approveMedia(api: JitsiApi, kind: MediaKind, participantId: string): void {
  try {
    const conference = conferenceOf(api);
    const fn = conference.avModerationApprove;
    if (typeof fn === "function") (fn as (media: string, id: string) => void).call(conference, kind, participantId);
  } catch {
    /* ignora */
  }
}

/**
 * Libera o microfone de UM participante e pede que ele ligue (comando nativo `askToUnmute`, que
 * no Jitsi chama conference.avModerationApprove). O Jitsi NÃO permite ligar o microfone de
 * outra pessoa: ela recebe o aviso e liga quando quiser.
 */
export function askToUnmute(api: JitsiApi, participantId: string): void {
  api.executeCommand("askToUnmute", participantId);
}

/**
 * Quanto a barra lateral direita do Jitsi ocupa (px, contando a seta de abrir/fechar), para o
 * botão flutuante ficar À ESQUERDA dela. Mede o DOM do Jitsi (#remoteVideos e
 * #toggleFilmstripButton), pois o estado interno não traz a largura real.
 * 0 quando não há barra à direita (ex.: visão de grade). null se não for possível ler.
 */
export function readSidebarOffset(api: JitsiApi): number | null {
  try {
    const frame = api.getIFrame?.();
    const doc = frame?.contentDocument;
    const win = frame?.contentWindow;
    if (!doc || !win) return null;

    const strip = doc.getElementById("remoteVideos")?.getBoundingClientRect();
    const toggle = doc.getElementById("toggleFilmstripButton")?.getBoundingClientRect();
    const half = win.innerWidth / 2;

    let left = Number.POSITIVE_INFINITY;
    for (const r of [strip, toggle]) {
      // só conta o que está de fato na metade direita e visível (tamanho > 0)
      if (r && r.width > 0 && r.height > 0 && r.left > half) left = Math.min(left, r.left);
    }
    if (!Number.isFinite(left)) return 0;
    return Math.max(0, Math.round(win.innerWidth - left));
  } catch {
    return null;
  }
}

/** Visibilidade da barra de botões do próprio Jitsi (some sozinha quando o mouse para). */
export function readToolboxVisible(api: JitsiApi): boolean | null {
  const visible = asObject(jitsiState(api)?.["features/toolbox"]).visible;
  return typeof visible === "boolean" ? visible : null;
}

/** O usuário local é moderador na sala? null = ainda sem informação. */
export function readLocalIsModerator(api: JitsiApi): boolean | null {
  const local = asObject(asObject(jitsiState(api)?.["features/base/participants"]).local);
  return typeof local.role === "string" ? local.role === "moderator" : null;
}

/**
 * Login do moderador feito pela NOSSA tela: chama o mesmo método que o diálogo de login do
 * Jitsi chama (conference.authenticateAndUpgradeRole). A senha só passa pela memória desta
 * página e vai ao Prosody; nada é guardado.
 * Rejeita com `Error` de mensagem curta (já em português, para mostrar ao usuário).
 */
export function loginModerator(
  api: JitsiApi,
  username: string,
  password: string,
  timeoutMs = 20000,
): Promise<void> {
  const startedAt = Date.now();
  return new Promise<void>((resolve, reject) => {
    const attempt = () => {
      const state = jitsiState(api);
      // Mesma ordem do diálogo de login do próprio Jitsi: enquanto a sala exige login (ainda não
      // aberta) a conferência fica em `authRequired`, e `conference` só existe depois de entrar.
      const conferenceState = asObject(state?.["features/base/conference"]);
      const conference = asObject(conferenceState.authRequired ?? conferenceState.conference);
      const login = conference.authenticateAndUpgradeRole;

      if (typeof login !== "function") {
        if (Date.now() - startedAt > timeoutMs) {
          reject(
            new Error(
              state
                ? "A sala não respondeu ao pedido de login. Tente novamente."
                : "Não foi possível conectar ao Jitsi para fazer o login.",
            ),
          );
        } else {
          window.setTimeout(attempt, 300); // o Jitsi ainda está criando a conferência
        }
        return;
      }

      const hosts = asObject(asObject(state?.["features/base/config"]).hosts);
      const authDomain = typeof hosts.authdomain === "string" ? hosts.authdomain : "";
      const id = username.includes("@") || !authDomain ? username : `${username}@${authDomain}`;

      try {
        const pending = (
          login as (o: {
            id: string;
            password: string;
            onLoginSuccessful: () => void;
          }) => PromiseLike<unknown>
        ).call(conference, { id, password, onLoginSuccessful: () => {} });
        pending.then(
          () => resolve(),
          (e: unknown) => {
            const err = asObject(e);
            reject(
              new Error(
                err.authenticationError
                  ? "Usuário ou senha incorretos."
                  : "Não foi possível entrar. Confira o usuário e a senha, ou se você tem acesso a esta sala.",
              ),
            );
          },
        );
      } catch {
        reject(new Error("Não foi possível iniciar o login."));
      }
    };
    attempt();
  });
}

/**
 * Lê o estado da sala de espera do Jitsi.
 */
export function readLobbyState(api: JitsiApi): LobbyState | null {
  try {
    const state = jitsiState(api);
    const lobby = state?.["features/lobby"] as Record<string, unknown> | undefined;
    if (!lobby) return null;

    const notifications = (state?.["features/notifications"] as
      | { notifications?: unknown[] }
      | undefined)?.notifications;
    const rejected =
      Array.isArray(notifications) &&
      notifications.some((n) => JSON.stringify(n).includes("lobby.joinRejectedTitle"));

    const raw = Array.isArray(lobby.knockingParticipants) ? lobby.knockingParticipants : [];
    const waiting: WaitingParticipant[] = [];
    for (const item of raw) {
      const p = (typeof item === "object" && item !== null ? item : {}) as Record<
        string,
        unknown
      >;
      if (typeof p.id === "string") {
        waiting.push({
          id: p.id,
          name: typeof p.name === "string" && p.name ? p.name : "Convidado",
        });
      }
    }

    return {
      knocking: Boolean(lobby.knocking),
      passwordJoinFailed: Boolean(lobby.passwordJoinFailed),
      rejected,
      waiting,
    };
  } catch {
    return null;
  }
}

let loading: Promise<JitsiConstructor> | null = null;

export function loadExternalApi(domain: string): Promise<JitsiConstructor> {
  if (window.JitsiMeetExternalAPI) {
    return Promise.resolve(window.JitsiMeetExternalAPI);
  }
  if (!loading) {
    loading = new Promise<JitsiConstructor>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://${domain}/external_api.js`;
      script.async = true;
      script.onload = () => {
        if (window.JitsiMeetExternalAPI) resolve(window.JitsiMeetExternalAPI);
        else reject(new Error("external_api.js carregou sem o objeto esperado"));
      };
      script.onerror = () => {
        loading = null;
        reject(new Error("Não foi possível carregar o Jitsi"));
      };
      document.head.appendChild(script);
    });
  }
  return loading;
}


function conferenceOf(api: JitsiApi): Record<string, unknown> {
  return asObject(asObject(jitsiState(api)?.["features/base/conference"]).conference);
}

/**
 * Revoga a liberação de microfone de UM participante (método nativo `avModerationReject`, o mesmo
 * que o Jitsi usa) e o silencia. Só tem efeito com a moderação de áudio ligada.
 */
export function blockAudio(api: JitsiApi, participantId: string): void {
  try {
    const conference = conferenceOf(api);
    const reject = conference.avModerationReject;
    if (typeof reject === "function") {
      (reject as (media: string, id: string) => void).call(conference, "audio", participantId);
    }
  } catch {
    /* sem o método, o botão simplesmente não revoga */
  }
  muteParticipant(api, participantId, "audio");
}

/**
 * Revoga a liberação de TODOS (volta ao estado "bloqueado").
 *
 * `reset`: use ao LIGAR o Modo Apresentador. Quem foi liberado com o modo desligado guarda a marca
 * "liberado" no próprio navegador, e o servidor só avisa de um bloqueio quem está na lista dele
 * (que nasce vazia ao ligar o modo). Por isso cada participante é liberado e bloqueado em seguida:
 * só assim o aviso de bloqueio chega e a marca é apagada. Exige o modo já ligado.
 */
export function revokeAllAudio(api: JitsiApi, reset = false): void {
  const conference = conferenceOf(api);
  const reject = conference.avModerationReject;
  const approve = conference.avModerationApprove;
  if (typeof reject !== "function") return;
  const ids = new Set<string>(readAudioModeration(api)?.approved ?? []);
  if (reset) for (const p of readParticipants(api) ?? []) if (!p.moderator) ids.add(p.id);
  for (const id of ids) {
    try {
      if (reset && typeof approve === "function") {
        (approve as (media: string, id: string) => void).call(conference, "audio", id);
      }
      (reject as (media: string, id: string) => void).call(conference, "audio", id);
    } catch {
      /* segue com os demais */
    }
  }
}

/** Baixa a mão de outro participante (mensagem nativa `lower-hand-message`, aceita só de moderador). */
export function lowerHand(api: JitsiApi, participantId: string): void {
  try {
    const conference = conferenceOf(api);
    const send = conference.sendEndpointMessage;
    if (typeof send === "function") {
      (send as (to: string, data: unknown) => void).call(conference, participantId, {
        name: "lower-hand-message",
      });
    }
  } catch {
    /* ignora */
  }
}


/** Microfone local mudo? null = ainda sem informação. */
export function readLocalAudioMuted(api: JitsiApi): boolean | null {
  const audio = asObject(asObject(jitsiState(api)?.["features/base/media"]).audio);
  return typeof audio.muted === "boolean" ? audio.muted : null;
}

/** A sala está exigindo login (a sessão guardada não valeu)? null = sem informação. */
export function readAuthRequired(api: JitsiApi): boolean | null {
  const state = jitsiState(api);
  if (!state) return null;
  return Boolean(asObject(state["features/base/conference"]).authRequired);
}

/**
 * Encerra a sessão no servidor (mesmo pedido do botão "Sair da conta" do Jitsi): o Jicofo esquece
 * o session-id e ele deixa de valer em qualquer sala. Resolve sempre (com limite de tempo).
 */
export function logoutSession(api: JitsiApi, timeoutMs = 3000): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, timeoutMs);
    try {
      const conference = asObject(asObject(jitsiState(api)?.["features/base/conference"]).conference);
      const room = asObject(conference.room);
      const moderator = asObject(asObject(room.xmpp).moderator);
      const logout = moderator.logout;
      if (typeof logout !== "function") {
        window.clearTimeout(timer);
        resolve();
        return;
      }
      (logout as (cb: () => void) => void).call(moderator, () => {
        window.clearTimeout(timer);
        resolve();
      });
    } catch {
      window.clearTimeout(timer);
      resolve();
    }
  });
}

/** "Silenciar sons de reação para todos" está ligado? (estado nativo do Jitsi; null = sem informação) */
export function readReactionsMuted(api: JitsiApi): boolean | null {
  const c = asObject(jitsiState(api)?.["features/base/conference"]);
  if (!jitsiState(api)) return null;
  return c.startReactionsMuted === true;
}

/**
 * Liga/desliga os sons de reação de TODOS. Faz o mesmo que a caixa "Mute reaction sounds for everyone" da aba Moderador do
 * Jitsi (que não aparece mais): a ação avisa os outros participantes (updateBackend) e silencia os sons locais. O Jitsi só
 * aceita de quem é moderador na sala.
 */
export function setReactionsMuted(api: JitsiApi, muted: boolean): void {
  try {
    const win = api.getIFrame?.()?.contentWindow as JitsiWindow | null | undefined;
    const dispatch = win?.APP?.store?.dispatch;
    if (!dispatch) return;
    dispatch({ type: "SET_START_REACTIONS_MUTED", muted, updateBackend: true });
    dispatch({ type: "SETTINGS_UPDATED", settings: { soundsReactions: !muted } });
  } catch {
    /* sem acesso ao Jitsi: nada a fazer */
  }
}

/** Estado das opções de grupo do Jitsi que o menu da sala controla (null = sem informação). */
export type GroupOptions = {
  startAudioMuted: boolean;
  startVideoMuted: boolean;
  followMe: boolean;
  followMeRecorder: boolean;
};

export function readGroupOptions(api: JitsiApi): GroupOptions | null {
  const state = jitsiState(api);
  if (!state) return null;
  const c = asObject(state["features/base/conference"]);
  const f = asObject(state["features/follow-me"]);
  return {
    startAudioMuted: c.startAudioMutedPolicy === true,
    startVideoMuted: c.startVideoMutedPolicy === true,
    // No Jitsi, "o gravador me segue" liga as duas marcas; na tela, "todos me seguem" só vale sem o gravador.
    followMe: f.followMeEnabled === true && f.followMeRecorderEnabled !== true,
    followMeRecorder: f.followMeRecorderEnabled === true,
  };
}

function jitsiStore(api: JitsiApi) {
  const win = api.getIFrame?.()?.contentWindow as JitsiWindow | null | undefined;
  return win?.APP?.store;
}

/**
 * "Todos iniciam silenciados / ocultos": quem entra depois começa com microfone/câmera desligados e pode ligar sozinho.
 * Faz o mesmo que a aba Moderador nativa: avisa a conferência e grava a política no estado.
 */
export function setStartMuted(api: JitsiApi, kind: "audio" | "video", value: boolean): void {
  try {
    const store = jitsiStore(api);
    if (!store) return;
    const state = store.getState() as Record<string, unknown>;
    const c = asObject(state["features/base/conference"]);
    const audio = kind === "audio" ? value : c.startAudioMutedPolicy === true;
    const video = kind === "video" ? value : c.startVideoMutedPolicy === true;
    (c.conference as { setStartMutedPolicy?: (p: { audio: boolean; video: boolean }) => void } | undefined)?.setStartMutedPolicy?.({
      audio,
      video,
    });
    store.dispatch?.({ type: "SET_START_MUTED_POLICY", startAudioMutedPolicy: audio, startVideoMutedPolicy: video });
  } catch {
    /* sem acesso ao Jitsi: nada a fazer */
  }
}

/* ------------------------- Sons do Jitsi (observador invisível) ------------------------- */

const SOUND_KEYS = ["soundsIncomingMessage", "soundsParticipantJoined", "soundsParticipantLeft", "soundsParticipantKnocking", "soundsTalkWhileMuted", "soundsReactions"] as const;
const SOUNDS_BACKUP = "dd-sounds-backup";

/**
 * Observador invisível: todos os sons ficam desligados (as opções de "Tocar sons" aparecem desmarcadas).
 * Os valores de antes ficam guardados e voltam ao sair do modo (`restoreSounds`), pois o Jitsi grava essas preferências no navegador.
 */
export function muteAllSounds(api: JitsiApi): void {
  try {
    const store = jitsiStore(api);
    if (!store) return;
    const current = asObject((store.getState() as Record<string, unknown>)["features/base/settings"]);
    if (!window.localStorage.getItem(SOUNDS_BACKUP)) {
      const backup: Record<string, boolean> = {};
      for (const k of SOUND_KEYS) backup[k] = current[k] !== false;
      window.localStorage.setItem(SOUNDS_BACKUP, JSON.stringify(backup));
    }
    const off: Record<string, boolean> = {};
    for (const k of SOUND_KEYS) off[k] = false;
    store.dispatch?.({ type: "SETTINGS_UPDATED", settings: off });
  } catch {
    /* sem acesso ao Jitsi ou ao armazenamento: os sons seguem como estavam */
  }
}

/**
 * Devolve os sons ao que a pessoa tinha antes do modo invisível (se houver o que devolver). Além do estado do Jitsi (se o iframe
 * ainda existe), corrige também o que ele gravou no navegador: assim o próximo carregamento já nasce certo, mesmo que o iframe
 * tenha sido fechado antes de gravar.
 */
export function restoreSounds(api: JitsiApi | null): void {
  try {
    const raw = window.localStorage.getItem(SOUNDS_BACKUP);
    if (!raw) return;
    const backup = asObject(JSON.parse(raw));
    try {
      jitsiStore(api as JitsiApi)?.dispatch?.({ type: "SETTINGS_UPDATED", settings: backup });
    } catch {
      /* o iframe pode já ter sido encerrado */
    }
    const saved = window.localStorage.getItem("features/base/settings");
    if (saved) window.localStorage.setItem("features/base/settings", JSON.stringify({ ...asObject(JSON.parse(saved)), ...backup }));
    window.localStorage.removeItem(SOUNDS_BACKUP);
  } catch {
    /* ignora */
  }
}

/** "Todos me seguem" (e "O gravador me segue"): os dois são excludentes no Jitsi, como na aba Moderador nativa. */
export function setFollowMe(api: JitsiApi, kind: "everyone" | "recorder", enabled: boolean): void {
  try {
    const store = jitsiStore(api);
    if (!store) return;
    const f = asObject((store.getState() as Record<string, unknown>)["features/follow-me"]);
    if (kind === "everyone") {
      if (enabled && f.followMeRecorderEnabled === true) store.dispatch?.({ type: "SET_FOLLOW_ME_RECORDER", enabled: false });
      store.dispatch?.({ type: "SET_FOLLOW_ME", enabled });
    } else {
      store.dispatch?.({ type: "SET_FOLLOW_ME_RECORDER", enabled });
    }
  } catch {
    /* sem acesso ao Jitsi: nada a fazer */
  }
}

/* ---------------------- Gravação (liberada pelo moderador) ---------------------- */

/** O que o moderador liberou na sala. Guardado nos metadados da conferência (compartilhados por todos os moderadores). */
export type MediaFlags = { recording: boolean };
const MEDIA_KEY = "ddmedia";

export function readMediaFlags(api: JitsiApi): MediaFlags | null {
  const state = jitsiState(api);
  if (!state) return null;
  const meta = asObject(asObject(state["features/base/conference"]).metadata);
  const v = asObject(meta[MEDIA_KEY]);
  return { recording: v.recording === true };
}

export function setMediaFlags(api: JitsiApi, flags: MediaFlags): void {
  try {
    const conf = asObject(asObject(jitsiState(api)?.["features/base/conference"])).conference as
      | { getMetadataHandler?: () => { setMetadata?: (key: string, value: unknown) => void } }
      | undefined;
    conf?.getMetadataHandler?.()?.setMetadata?.(MEDIA_KEY, flags);
  } catch {
    /* sem acesso ao Jitsi: nada a fazer */
  }
}

/** Situação da gravação no Jitsi. `since` = início da gravação em ms (null se desconhecido). */
export type MediaStatus = { recording: "off" | "pending" | "on"; since: number | null };

export function readMediaStatus(api: JitsiApi): MediaStatus | null {
  const state = jitsiState(api);
  if (!state) return null;
  const sessions = asObject(state["features/recording"]).sessionDatas;
  let recording: MediaStatus["recording"] = "off";
  let since: number | null = null;
  if (Array.isArray(sessions)) {
    for (const raw of sessions) {
      const s = asObject(raw);
      if (s.mode !== "file") continue;
      if (s.status === "on") {
        recording = "on";
        const t = typeof s.timestamp === "number" ? s.timestamp : null;
        // O Jitsi guarda o início em segundos ou milissegundos conforme a versão.
        since = t === null ? null : t < 1e12 ? t * 1000 : t;
      } else if (s.status === "pending" && recording !== "on") {
        recording = "pending";
      }
    }
  }
  return { recording, since };
}

/** Liga/desliga a gravação (precisa do serviço de gravação, a ser instalado). */
export function setRecording(api: JitsiApi, start: boolean): void {
  try {
    if (start) api.executeCommand("startRecording", { mode: "file" });
    else api.executeCommand("stopRecording", "file");
  } catch {
    /* sem acesso ao Jitsi: nada a fazer */
  }
}

/**
 * Avisa quando um moderador ENCERRA A REUNIÃO PARA TODOS: o Jitsi guarda o erro "conference.destroyed" no estado da conferência.
 * (O diálogo nativo "A chamada foi encerrada" aparece em seguida; quem chama esconde o iframe na hora.) Devolve a função que cancela.
 * Depende de partes internas do Jitsi (versão fixada); se algo mudar, não avisa nada e o fluxo cai na saída comum.
 */
export function watchMeetingEnded(api: JitsiApi, onEnded: () => void): () => void {
  let unsubscribe: (() => void) | undefined;
  let fired = false;
  let timer: number | undefined;
  const attach = (): boolean => {
    try {
      const store = jitsiStore(api);
      // Quando a API é criada, o app do Jitsi ainda está carregando dentro do iframe: o estado só existe depois.
      if (!store?.subscribe || !store.getState()["features/base/conference"]) return false;
      unsubscribe = store.subscribe(() => {
        if (fired) return;
        const conf = ((store.getState() as Record<string, unknown>)["features/base/conference"] ?? {}) as { error?: { name?: unknown } };
        // O nome vem do lib-jitsi-meet ("conference.destroyed"); a conferência encerrada por um moderador também traz o motivo no texto.
        const err = JSON.stringify(conf.error ?? "").toLowerCase();
        if (conf.error && (String(conf.error.name).toLowerCase().includes("destroyed") || err.includes("meeting has been terminated"))) {
          fired = true;
          onEnded();
        }
      });
      return true;
    } catch {
      return false;
    }
  };
  if (!attach()) {
    let tries = 0;
    timer = window.setInterval(() => {
      tries += 1;
      if (attach() || tries > 120) window.clearInterval(timer);
    }, 500);
  }
  return () => {
    if (timer !== undefined) window.clearInterval(timer);
    try {
      unsubscribe?.();
    } catch {
      /* o iframe pode já ter sido desmontado */
    }
  };
}
