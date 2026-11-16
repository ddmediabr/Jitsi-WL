"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CircleAlertIcon, EyeIcon, LoaderCircleIcon, SlidersHorizontalIcon } from "lucide-react";
import { useBrand } from "@/components/BrandProvider";
import ExitScreen, { type ExitReason } from "@/components/ExitScreen";
import JitsiFrame from "@/components/JitsiFrame";
import LoginForm from "@/components/LoginForm";
import RoomMenu, { type MenuProfile, type ProfileResult } from "@/components/RoomMenu";
import PrejoinForm, { type PrejoinResult } from "@/components/PrejoinForm";
import Shell from "@/components/Shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import {
  askToUnmute,
  loginModerator,
  logoutSession,
  readAuthRequired,
  muteParticipant,
  parseRoom,
  blockAudio,
  lowerHand,
  readAudioModeration,
  muteAllSounds,
  restoreSounds,
  readMediaModeration,
  setMediaModeration,
  approveMedia,
  blockMedia,
  type MediaKind,
  type MediaModeration,
  readLocalAudioMuted,
  revokeAllAudio,
  readLobbyState,
  watchMeetingEnded,
  readLocalIsModerator,
  readParticipants,
  readGroupOptions,
  readMediaFlags,
  readMediaStatus,
  readReactionsMuted,
  readSidebarOffset,
  readToolboxVisible,
  setAudioModeration,
  setFollowMe,
  setMediaFlags,
  setRecording,
  type MediaFlags,
  type MediaStatus,
  setReactionsMuted,
  setStartMuted,
  type GroupOptions,
  type AudioModeration,
  type JitsiApi,
  type RoomParticipant,
  type WaitingParticipant,
} from "@/lib/jitsi";
import { brandUrl } from "@/lib/brand";
import { notify } from "@/lib/notify";
import { goHome } from "@/lib/nav";
import { rememberRoom } from "@/lib/recent-rooms";
import {
  clearMember,
  dropStaleJitsiSession,
  prepareCookies,
  readSavedMember,
  saveMember,
} from "@/lib/session";
import { cn } from "@/lib/utils";

type Stage =
  | "choose" // cadastrado ou convidado
  | "login" // NOSSA tela: usuário e senha
  | "member-form" // NOSSA tela: nome, câmera, microfone, aparelhos
  | "member" // Jitsi fora da tela; login por código; depois aparece a sala
  | "guest-form" // NOSSA tela: nome, câmera, microfone, aparelhos
  | "guest" // Jitsi fora da tela; espera própria até ser aprovado
  | "left"; // saída da reunião (saiu/desconectou ou foi removido)

// Eventos da IFrame API (sem consulta repetida). `notificationTriggered` dispara para TODA
// notificação interna do Jitsi, mesmo com elas desativadas (config `notifications: []`).
const COMMON_EVENTS = [
  "videoConferenceJoined",
  "readyToClose",
  "passwordRequired",
  "errorOccurred",
  "participantKickedOut",
  "participantJoined",
  "participantLeft",
  "micError",
  "cameraError",
  "audioMuteStatusChanged",
  "moderationStatusChanged",
  "moderationParticipantApproved",
  "notificationTriggered",
  "videoConferenceLeft",
];
const MEMBER_EVENTS = [...COMMON_EVENTS, "knockingParticipant", "raiseHandUpdated"];
const GUEST_EVENTS = COMMON_EVENTS;

/** Depois de entrar, o Jitsi reenvia "entrou" de quem já estava na sala: ignoramos esse começo. */
const JOIN_QUIET_MS = 3000;
/** Junta avisos repetidos do Jitsi (ex.: "libera e bloqueia" de vários participantes). */
const UNMUTE_CONFIRM_MS = 450;
/**
 * Ao ligar o Modo Apresentador, o painel libera e bloqueia cada participante em seguida (para
 * limpar permissões antigas) e o Jitsi avisa "pedido para ligar" nessa limpeza. Ignoramos esse
 * aviso durante esta janela.
 */
const MODE_RESET_WINDOW_MS = 3500;

/** Diagnóstico: no console do navegador, `localStorage.ddDebug = "1"` lista as notificações. */
const DEBUG_NOTIFICATIONS =
  typeof window !== "undefined" && window.localStorage?.getItem("ddDebug") === "1";

/** Preenche id -> nome com quem já estava na sala (API síncrona da IFrame API). */
function seedNames(api: JitsiApi | null, map: Map<string, string>, selfId: string | null) {
  try {
    const list = (api as unknown as { getParticipantsInfo?: () => unknown } | null)
      ?.getParticipantsInfo?.();
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const p = asRecord(item);
      const id = typeof p.participantId === "string" ? p.participantId : null;
      const name = typeof p.displayName === "string" && p.displayName ? p.displayName : null;
      if (id && name && id !== selfId) map.set(id, name);
    }
  } catch {
    /* sem nomes: os avisos de saída desse participante são omitidos */
  }
}

/** Texto curto e seguro para mostrar num aviso. */
function shortMessage(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value.slice(0, 140) : undefined;
}

/** Tempo para considerar o pedido encerrado depois que a espera some sem entrar. */
const ENDED_GRACE_MS = 6000;
/** Limite para o login do cadastrado terminar e a sala abrir. */
const MEMBER_ENTER_TIMEOUT_MS = 40000;
/** Leitura da barra do Jitsi (aparece/some com o mouse): rápida para acompanhar. */
const FAST_TICK_MS = 250;
const OVERRIDE_MS = 4000;

/** Aplica as ações recém-feitas por cima do estado lido por alguns segundos (o Jitsi leva um instante para confirmar e passa por estados intermediários). */
function withOverrides(
  mod: AudioModeration | null,
  overrides: Map<string, { approved: boolean; until: number }>,
): AudioModeration | null {
  if (!mod || overrides.size === 0) return mod;
  const now = Date.now();
  const approved = new Set(mod.approved);
  for (const [id, o] of overrides) {
    if (o.until < now) {
      overrides.delete(id);
      continue;
    }
    if (o.approved) approved.add(id);
    else approved.delete(id);
  }
  return { ...mod, approved: Array.from(approved) };
}
/**
 * Barra do Jitsi sem o que deixou de existir na sala: "security" (regras e senha agora só pelo painel),
 * "recording"/"livestreaming" (não há serviço de gravação) e "embedmeeting".
 */
const TOOLBAR_BUTTONS = [
  "camera", "chat", "closedcaptions", "desktop", "download", "etherpad", "feedback", "filmstrip",
  "fullscreen", "hangup", "help", "highlight", "invite", "linktosalesforce", "microphone",
  "noisesuppression", "participants-pane", "raisehand", "select-background", "settings",
  "shareaudio", "sharedvideo", "shortcuts", "stats", "tileview", "toggle-camera", "videoquality", "whiteboard",
];

/** Resposta do servidor à senha da sala, em português claro. */
const PASSWORD_MESSAGES: Record<string, string> = {
  senha: "Senha incorreta ou já trocada. Peça a senha atual a um moderador.",
  fechada: "A reunião está fechada: ninguém entra sem aprovação, nem com a senha. Entre sem a senha e aguarde um moderador.",
  sem_reuniao: "A reunião ainda não começou. Entre sem a senha e aguarde um moderador.",
  indisponivel: "Esta sala não usa senha de entrada.",
};

const SLOW_EVERY = 4; // lobby e participantes: a cada 1 s

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function sameIds(a: { id: string }[], b: { id: string }[]) {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id);
}

export default function RoomFlow() {
  const pathname = usePathname();
  const room = parseRoom(pathname);

  const [stage, setStage] = useState<Stage>("choose");
  /** Por que a reunião terminou para a pessoa (tela de saída). */
  const [exitReason, setExitReason] = useState<ExitReason>("left");
  /** Só mostra a tela inicial depois de checar se há sessão guardada (evita piscar a tela errada). */
  const [ready, setReady] = useState(false);
  /** Estado público da sala (existe? exclusiva?), só para mensagens claras; o servidor decide o acesso. */
  const [roomInfo, setRoomInfo] = useState<{ exists: boolean; exclusive: boolean; expired: boolean; password: boolean } | null>(null);
  /** Entrar com a senha / modo invisível: estado da tela de entrada. */
  const [entryError, setEntryError] = useState<string | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const [invisibleAvailable, setInvisibleAvailable] = useState(false);
  /** Senha da sala (vista pelo moderador no menu): atualizada enquanto o menu está aberto. */
  const [roomPassword, setRoomPassword] = useState<{ enabled: boolean; password: string | null; rotatesIn: number | null; fetchedAt: number } | null>(null);
  /** Entrando com a sessão guardada (sem digitar senha). */
  const [resume, setResume] = useState(false);
  const [prejoin, setPrejoin] = useState<PrejoinResult | null>(null);
  const [inRoom, setInRoom] = useState(false);
  const [confirmLeaveInvisible, setConfirmLeaveInvisible] = useState(false);
  const [apiReady, setApiReady] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  /** Cadastrado que caiu na sala de espera (ex.: "Reunião fechada"): espera a aprovação, sem estourar o prazo de entrada. */
  const [memberWaiting, setMemberWaiting] = useState(false);
  const memberWaitingRef = useRef(false);
  /** Papel da conta nesta sala, quando o login acabou de ser feito (só para escolher a mensagem certa). */
  const memberLevelRef = useRef<"moderator" | "member" | "none" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  /** Só o nome de usuário (não é segredo): pré-preenche o nome de exibição. */
  const [memberUser, setMemberUser] = useState("");
  /** Conta logada sem acesso a esta sala: entra como convidada, com o nome da conta sugerido. */
  const [guestName, setGuestName] = useState("");
  const loggingIn = useRef(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [waiting, setWaiting] = useState<WaitingParticipant[]>([]);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [participantsAvailable, setParticipantsAvailable] = useState(true);
  const [sidebarOffset, setSidebarOffset] = useState(0);
  const [toolboxVisible, setToolboxVisible] = useState(false);
  const [localModerator, setLocalModerator] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  /** Reunião fechada (decidida por um moderador): null = não consultada/indisponível. */
  const [meetingClosed, setMeetingClosed] = useState<boolean | null>(null);
  /** Perfil da conta logada (nome, foto, situação da política de trocas), como o painel devolve. */
  const [account, setAccount] = useState<MenuProfile | null>(null);
  /** "Silenciar sons de reação" (estado nativo do Jitsi). */
  const [reactionsMuted, setReactionsMutedState] = useState<boolean | null>(null);
  /** Opções de grupo (iniciar silenciado/oculto, seguir): estado nativo do Jitsi. */
  const [groupOptions, setGroupOptions] = useState<GroupOptions | null>(null);
  /** Gravação/transcrição liberadas pelo moderador, e a situação real no Jitsi. */
  const [media, setMedia] = useState<MediaFlags | null>(null);
  const [mediaStatus, setMediaStatus] = useState<MediaStatus | null>(null);
  const [mediaNote, setMediaNote] = useState<string | null>(null);
  /** "Transcrever ao final": vale para a próxima gravação iniciada. */
  const [transcribeAtEnd, setTranscribeAtEnd] = useState(false);
  const recordingSeenAt = useRef<number | null>(null);
  const [moderation, setModeration] = useState<AudioModeration | null>(null);
  const [mediaMod, setMediaMod] = useState<MediaModeration | null>(null);
  /** Moderador REAL desta sala (não interino): consulta ao painel ao entrar. */
  const [realModerator, setRealModerator] = useState(false);
  /** Pedidos já atendidos (alguém foi liberado): somem da lista mesmo que a mão continue levantada. */
  const [dismissed, setDismissed] = useState<string[]>([]);
  const joinedAt = useRef(0);
  const isModerator = useRef(false);
  /** Observador invisível: nenhum aviso pode levá-lo a ligar microfone ou câmera (isso o revelaria). */
  const isInvisible = useRef(false);
  /** Última liberação que o moderador fez PARA MIM (o Jitsi usa o mesmo aviso para microfone, câmera e tela). */
  const lastApproved = useRef<{ kind: "audio" | "video" | "desktop"; at: number } | null>(null);
  const sessionFailedRef = useRef<(message: string) => void>(() => undefined);
  const unmuteTimer = useRef<number | null>(null);
  /** id -> nome, alimentado pelos eventos (o evento de saída traz só o id). */
  const names = useRef(new Map<string, string>());
  const selfId = useRef<string | null>(null);
  /** Quem foi removido: o "saiu" dele não vira aviso (já existe o "removido"). */
  const kickedIds = useRef(new Set<string>());
  const modeOnAt = useRef(0);
  /** Eu saí/fui removido: o Jitsi dispara "saiu" de todos os outros ao me desconectar; ignorar. */
  const leaving = useRef(false);
  const api = useRef<JitsiApi | null>(null);
  const joined = useRef(false);
  /** O Jitsi avisou que fui removido por um moderador (decide qual tela de saída aparece). */
  const kickedLocal = useRef(false);
  /** Como a pessoa entrou na última reunião (convidado ou cadastrado): "Voltar à sala" pula a escolha de acesso. */
  const lastAccess = useRef<"member" | "guest" | null>(null);
  /** Nome que o convidado usou na última reunião (volta preenchido ao retornar à sala). */
  const lastGuestName = useRef("");
  /** Já estamos saindo para a tela de saída: ignora novos pedidos de saída (o Jitsi ainda dispara eventos). */
  const exitLock = useRef(false);
  /** Quando o Jitsi avisou que saí da conferência (a demora até o "fechar" revela o diálogo "A chamada foi encerrada"). */
  const leftAt = useRef(0);
  /** Esconde o iframe na hora (os diálogos nativos do Jitsi, como "removeu você da reunião", nunca aparecem). */
  const [exiting, setExiting] = useState(false);
  const frameBox = useRef<HTMLDivElement>(null);
  /** Esconde o iframe NA HORA (antes de o React redesenhar): o diálogo nativo do Jitsi nem chega a aparecer. */
  const hideFrameNow = useCallback(() => {
    if (frameBox.current) frameBox.current.style.visibility = "hidden";
  }, []);
  /** Liberações/bloqueios recém-feitos: valem até o Jitsi confirmar (evita o selo piscar). */
  const audioOverrides = useRef(new Map<string, { approved: boolean; until: number }>());
  /** Credenciais do login em curso: só em memória, apagadas assim que usadas. */
  const creds = useRef<{ user: string; password: string } | null>(null);

  useEffect(() => {
    if (!room) return;
    let alive = true;
    fetch(`/flow-api/room-info?room=${encodeURIComponent(room)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { exists?: boolean; exclusive?: boolean; expired?: boolean; password?: boolean }) => {
        if (alive) setRoomInfo({ exists: d.exists !== false, exclusive: d.exclusive === true, expired: d.expired === true, password: d.password === true });
      })
      .catch(() => undefined); // sem a informação, a tela segue normal
    return () => {
      alive = false;
    };
  }, [room]);

  // Sessão guardada neste navegador? Pula a escolha e vai direto para câmera/microfone.
  // Leitura única do localStorage na montagem (no servidor não existe): por isso é um efeito.
  useEffect(() => {
    const saved = readSavedMember();
    /* eslint-disable react-hooks/set-state-in-effect */
    if (saved) {
      setMemberUser(saved.user);
      setResume(true);
      setStage("member-form");
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (stage === "member" || stage === "guest") lastAccess.current = stage;
    if (stage === "guest" && prejoin?.name) lastGuestName.current = prejoin.name;
  }, [stage, prejoin]);

  /** Da tela de saída de volta à sala, direto para a etapa de câmera e microfone do mesmo tipo de acesso. */
  const returnToRoom = useCallback(() => {
    if (lastAccess.current === "guest") {
      setGuestName(lastGuestName.current);
      setStage("guest-form");
      return;
    }
    const saved = readSavedMember();
    if (saved) {
      setMemberUser(saved.user);
      setResume(true);
      setStage("member-form");
    } else {
      setStage("login");
    }
  }, []);

  const resetSession = useCallback(() => {
    restoreSounds(api.current); // devolve os sons de quem estava invisível (mesmo sem o iframe)
    api.current?.executeCommand("hangup");
    api.current = null;
    joined.current = false;
    leftAt.current = 0;
    creds.current = null;
    setApiReady(false);
    memberWaitingRef.current = false;
    setMemberWaiting(false);
    setWaiting([]);
    setParticipants([]);
    setModeration(null);
    setMediaMod(null);
    setRealModerator(false);
    setDismissed([]);
    notify.dismissUnmuteInvite();
    if (unmuteTimer.current !== null) window.clearTimeout(unmuteTimer.current);
    unmuteTimer.current = null;
    names.current.clear();
    kickedIds.current.clear();
    notify.cancelPresence(); // avisos de entrada/saída pendentes não devem aparecer depois de sair
    leaving.current = false;
    selfId.current = null;
    setPanelOpen(false);
    setInRoom(false);
    setRequestSent(false);
    setNotice(null);
    setNeedsPassword(false);
    setPassword("");
    setToolboxVisible(false);
    setLocalModerator(false);
    setConfirmLeaveInvisible(false);
    setPrejoin(null);
  }, []);

  // Saída limpa: manda o Jitsi sair da sala e só depois desmonta o iframe. Desmontar na hora derruba a conexão
  // sem aviso e o servidor mantém a pessoa "na sala" por cerca de um minuto (atrasa, por exemplo, o
  // moderador interino reassumir quando o último moderador real sai).
  const leave = useCallback(
    (options?: { exit?: boolean; reason?: ExitReason }) => {
      if (exitLock.current) return;
      // Com `exit`, quem estava mesmo na reunião (ou foi removido dela) vê a tela de saída; os demais voltam à escolha de acesso.
      const kicked = kickedLocal.current;
      const showExit = options?.exit === true && (joined.current || kicked);
      if (showExit) {
        exitLock.current = true;
        hideFrameNow();
        setExiting(true);
      }
      const reason: ExitReason = options?.reason ?? (kicked ? "kicked" : "left");
      try {
        api.current?.executeCommand("hangup");
      } catch {
        /* o iframe pode já ter sido encerrado */
      }
      window.setTimeout(() => {
        resetSession();
        kickedLocal.current = false;
        // Com a tela de saída, o bloqueio só cai quando a pessoa sai dela (efeito abaixo): eventos tardios do Jitsi não a substituem.
        if (!showExit) exitLock.current = false;
        setExiting(false);
        setLoginError(null);
        setResume(false);
        if (showExit) {
          setExitReason(reason);
          setStage("left");
        } else {
          setStage("choose");
        }
      }, api.current ? 700 : 0);
    },
    [resetSession, hideFrameNow],
  );

  useEffect(() => {
    if (stage !== "left") exitLock.current = false;
  }, [stage]);

  useEffect(() => {
    isInvisible.current = prejoin?.invisible === true;
  }, [prejoin]);

  // Moderador real x interino (a interface esconde Configurações da sala e gravação do interino; o servidor também barra a gravação).
  useEffect(() => {
    if (stage !== "member" || !inRoom || !room) return;
    let alive = true;
    fetch(`/flow-api/role?room=${encodeURIComponent(room)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { moderator?: boolean }) => {
        if (alive) setRealModerator(d.moderator === true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [stage, inRoom, room]);

  // Abriu a página: se um modo invisível anterior não devolveu os sons (aba fechada), devolve agora, antes de qualquer iframe carregar.
  useEffect(() => {
    restoreSounds(null);
  }, []);

  // Observador invisível não tem moderação: para agir, sai do modo e volta à etapa de câmera e microfone, já visível.
  const leaveInvisible = useCallback(async () => {
    exitLock.current = true; // o "fechar" do Jitsi não deve levar à tela de saída: é uma troca de modo (o efeito acima solta o bloqueio ao mudar de etapa)
    hideFrameNow();
    try {
      await fetch("/flow-api/invisible", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ room, on: false }),
      });
    } catch {
      /* sem resposta: o pedido antigo só vale para a próxima entrada, e a escolha na etapa seguinte o refaz */
    }
    try {
      api.current?.executeCommand("hangup");
    } catch {
      /* o iframe pode já ter sido encerrado */
    }
    window.setTimeout(() => {
      resetSession();
      setResume(true);
      setStage("member-form");
    }, 700);
  }, [room, resetSession, hideFrameNow]);

  // "Encerrar sessão": derruba a sessão no servidor, esquece o aviso local e sai.
  const logout = useCallback(async () => {
    if (api.current) await logoutSession(api.current);
    await prepareCookies({ reset: true }); // novo segredo: a ligação antiga com a conta deixa de valer
    clearMember();
    leave();
  }, [leave]);

  // Sessão inválida/expirada/sem acesso à sala: esquece e pede o login.
  const sessionFailed = useCallback(
    (message: string) => {
      // Não apaga o aviso: sem acesso A ESTA sala não significa sessão inválida nas outras.
      resetSession();
      setResume(false);
      setLoginError(message);
      setStage("login");
    },
    [resetSession],
  );

  const onEvent = useCallback(
    (event: string, payload: unknown) => {
      const data = asRecord(payload);
      switch (event) {
        case "knockingParticipant": {
          const p = asRecord(data.participant);
          const id = typeof p.id === "string" ? p.id : null;
          if (!id) return;
          const name = typeof p.name === "string" && p.name ? p.name : "Convidado";
          setWaiting((list) => (list.some((k) => k.id === id) ? list : [...list, { id, name }]));
          notify.knocking(id, name, () => setPanelOpen(true));
          break;
        }
        case "videoConferenceJoined":
          joined.current = true;
          if (room) rememberRoom(room);
          joinedAt.current = Date.now();
          selfId.current = typeof data.id === "string" ? data.id : null;
          // Observador: sons desligados; quem entra visível recupera os que tinha (se um modo invisível anterior não chegou a devolvê-los).
          if (api.current) {
            if (isInvisible.current) muteAllSounds(api.current);
            else restoreSounds(api.current);
          }
          // O Jitsi não manda "entrou" de quem já estava na sala: pega os nomes de uma vez.
          window.setTimeout(() => seedNames(api.current, names.current, selfId.current), 1500);
          setInRoom(true);
          setNeedsPassword(false);
          setNotice(null);
          break;
        case "passwordRequired":
          setNeedsPassword(true);
          break;
        case "participantKickedOut": {
          if (!joined.current) {
            setNotice("Sua entrada não foi autorizada.");
          } else {
            const kicked = asRecord(data.kicked);
            if (kicked.local === true) {
              // Removido: vai direto à tela de saída, sem o diálogo nativo do Jitsi nem aviso por cima.
              kickedLocal.current = true;
              leaving.current = true;
              hideFrameNow();
              notify.cancelPresence();
              leave({ exit: true, reason: "kicked" });
            } else if (typeof kicked.id === "string") {
              kickedIds.current.add(kicked.id);
              notify.removed(names.current.get(kicked.id) ?? "Alguém");
            }
          }
          break;
        }
        case "participantJoined": {
          const id = typeof data.id === "string" ? data.id : null;
          const name =
            typeof data.displayName === "string" && data.displayName ? data.displayName : "Alguém";
          if (!id || id === selfId.current || leaving.current) break;
          names.current.set(id, name);
          if (Date.now() - joinedAt.current > JOIN_QUIET_MS) notify.joined(name);
          break;
        }
        case "participantLeft": {
          const id = typeof data.id === "string" ? data.id : null;
          if (!id || id === selfId.current || leaving.current) break;
          const name = names.current.get(id);
          names.current.delete(id);
          // Removido (já avisado) ou desconhecido: sem aviso, para nunca anunciar alguém errado.
          if (kickedIds.current.delete(id) || !name) break;
          if (Date.now() - joinedAt.current > JOIN_QUIET_MS) notify.left(name);
          break;
        }
        case "raiseHandUpdated": {
          if (!isModerator.current || data.handRaised !== true) break;
          const id = typeof data.id === "string" ? data.id : "";
          notify.handRaised(names.current.get(id) ?? "Alguém");
          break;
        }
        case "micError":
          notify.error("Não foi possível usar o microfone", shortMessage(data.message));
          break;
        case "cameraError":
          notify.error("Não foi possível usar a câmera", shortMessage(data.message));
          break;
        case "audioMuteStatusChanged":
          if (data.muted === false) notify.dismissUnmuteInvite();
          break;
        case "moderationStatusChanged":
          if (data.mediaType === "audio" && data.enabled === true) modeOnAt.current = Date.now();
          if (data.mediaType === "audio" && !isModerator.current) {
            notify.info(
              data.enabled === true
                ? "Modo apresentador ligado: levante a mão para falar"
                : "Modo apresentador desligado",
            );
          }
          if ((data.mediaType === "video" || data.mediaType === "desktop") && !isModerator.current) {
            const what = data.mediaType === "video" ? "A câmera" : "O compartilhamento de tela";
            notify.info(data.enabled === true ? `${what} está bloqueado: peça a liberação ao moderador` : `${what} foi liberado para todos`);
          }
          break;
        case "moderationParticipantApproved":
          // Só anota: o aviso para a pessoa sai junto com a notificação do Jitsi (abaixo), que já traz o tipo certo.
          // Quem não é moderador só recebe este evento sobre si mesmo.
          if ((data.id === selfId.current || !isModerator.current) && (data.mediaType === "audio" || data.mediaType === "video" || data.mediaType === "desktop")) {
            lastApproved.current = { kind: data.mediaType, at: Date.now() };
          }
          break;
        case "notificationTriggered": {
          // Um evento por notificação interna do Jitsi (título = chave de tradução).
          if (DEBUG_NOTIFICATIONS) console.info("[jitsi notification]", data.title);
          switch (data.title) {
            case "notify.hostAskedUnmute":
              if (isInvisible.current) break; // observador: pedido de moderador ignorado, sem aviso
              // O Jitsi manda um aviso por tentativa; juntamos os repetidos.
              if (unmuteTimer.current !== null) window.clearTimeout(unmuteTimer.current);
              unmuteTimer.current = window.setTimeout(() => {
                unmuteTimer.current = null;
                const live = api.current;
                if (!live) return;
                // O mesmo aviso do Jitsi vale para microfone, câmera e tela: o tipo vem da liberação que acabou de chegar.
                const recent = lastApproved.current && Date.now() - lastApproved.current.at < 5000 ? lastApproved.current.kind : "audio";
                if (recent === "video") {
                  notify.unmuteInvite("Sua câmera foi liberada", undefined, () => api.current?.executeCommand("toggleVideo"), "Ligar câmera");
                  return;
                }
                if (recent === "desktop") {
                  notify.unmuteInvite("Seu compartilhamento de tela foi liberado");
                  return;
                }
                if (readLocalAudioMuted(live) === false) return;
                if (Date.now() - modeOnAt.current < MODE_RESET_WINDOW_MS) return; // limpeza automática
                const presenter = readAudioModeration(live)?.enabled === true;
                notify.unmuteInvite(
                  presenter
                    ? "Seu microfone foi liberado"
                    : "O moderador pediu para você ligar o microfone",
                  undefined,
                  () => api.current?.executeCommand("toggleAudio"),
                );
              }, UNMUTE_CONFIRM_MS);
              break;
            case "notify.mutedRemotelyTitle":
              notify.info("O moderador silenciou seu microfone", undefined, "mic-muted");
              break;
            case "notify.videoMutedRemotelyTitle":
              notify.info("O moderador desligou sua câmera", undefined, "cam-off");
              break;
            case "notify.moderationInEffectTitle":
            case "notify.audioUnmuteBlockedTitle":
              notify.micBlocked(() => api.current?.executeCommand("toggleRaiseHand"));
              break;
            case "lobby.joinRejectedTitle":
              if (!joined.current) setNotice("Sua entrada foi recusada por um moderador.");
              break;
          }
          break;
        }
        case "videoConferenceLeft":
          leaving.current = true;
          leftAt.current = Date.now();
          notify.cancelPresence();
          break;
        case "readyToClose":
          // Saída voluntária fecha na hora; se demorou, a pessoa teve de dispensar o diálogo "A chamada foi encerrada" (reunião encerrada para todos).
          leave({ exit: true, reason: leftAt.current > 0 && Date.now() - leftAt.current > 1500 ? "ended" : undefined });
          break;
      }
    },
    [leave, room, hideFrameNow],
  );

  // Reunião encerrada para todos: o Jitsi guarda o erro "conference.destroyed"; vai direto para a tela "Fim da reunião".
  useEffect(() => {
    if ((stage !== "member" && stage !== "guest") || !apiReady || !api.current) return;
    return watchMeetingEnded(api.current, () => {
      if (!joined.current) return;
      leaving.current = true;
      hideFrameNow();
      notify.cancelPresence();
      leave({ exit: true, reason: "ended" });
    });
  }, [stage, apiReady, leave, hideFrameNow]);

  // Cadastrado: com o Jitsi pronto, faz o login por código (credenciais usadas e apagadas).
  useEffect(() => {
    if (stage !== "member" || !apiReady || !api.current || !creds.current) return;
    const { user, password: pass } = creds.current;
    creds.current = null;
    const instance = api.current;
    let alive = true;

    loginModerator(instance, user, pass).catch((e: Error) => {
      if (!alive) return;
      resetSession();
      setLoginError(e.message);
      setStage("login");
    });

    // Se o login "passar" mas a sala não abrir, não deixa o usuário preso.
    const timeout = window.setTimeout(() => {
      if (!alive || joined.current || memberWaitingRef.current) return;
      resetSession();
      setLoginError("A sala não abriu a tempo. Tente novamente.");
      setStage("login");
    }, MEMBER_ENTER_TIMEOUT_MS);

    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, [stage, apiReady, resetSession]);

  // Cadastrado (login feito pelo painel ou sessão guardada): o servidor decide o acesso. Se a sala pedir
  // login de novo ou não abrir a tempo, a sessão não vale aqui: volta para o login.
  useEffect(() => {
    if (stage !== "member" || !resume || !apiReady) return;
    let alive = true;
    const timer = window.setInterval(() => {
      const instance = api.current;
      if (!alive || !instance) return;
      if (readAuthRequired(instance) === true) {
        sessionFailedRef.current(
          memberLevelRef.current === "member"
            ? "Aguarde um moderador abrir a sala. Quando ele entrar, tente novamente."
            : "Sua sessão expirou, não há moderador na sala ou você não tem acesso a ela. Se for moderador, entre novamente.",
        );
        return;
      }
    }, 500);
    const timeout = window.setTimeout(() => {
      if (alive && !joined.current && !memberWaitingRef.current) {
        sessionFailedRef.current("A sala não abriu a tempo. Entre novamente.");
      }
    }, MEMBER_ENTER_TIMEOUT_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, [stage, resume, apiReady]);

  // Cadastrado: se o Jitsi o mandou para a sala de espera (reunião fechada), mostra a espera e acompanha.
  useEffect(() => {
    if (stage !== "member" || !apiReady) return;
    const timer = window.setInterval(() => {
      if (joined.current || !api.current) return;
      const lobby = readLobbyState(api.current);
      if (!lobby) return;
      if (lobby.rejected) {
        sessionFailedRef.current("Sua entrada foi recusada por um moderador.");
        return;
      }
      if (lobby.knocking && !memberWaitingRef.current) {
        memberWaitingRef.current = true;
        setMemberWaiting(true);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage, apiReady]);

  // Moderador confirmado: guarda o aviso (só o usuário) para retomar nas próximas salas.
  useEffect(() => {
    if (stage === "member" && inRoom && localModerator && memberUser) saveMember(memberUser);
  }, [stage, inRoom, localModerator, memberUser]);

  // Convidado: acompanha a sala de espera (lendo o estado do Jitsi no iframe).
  useEffect(() => {
    if (stage !== "guest") return;
    let seen = false;
    let endedSince: number | null = null;
    const timer = window.setInterval(() => {
      if (joined.current || !api.current) return;
      const lobby = readLobbyState(api.current);
      if (!lobby) return;
      if (lobby.rejected) {
        // Sinal explícito: o Jitsi avisou que um moderador recusou o pedido.
        setNotice("Sua entrada foi recusada por um moderador.");
        return;
      }
      if (lobby.knocking) {
        seen = true;
        endedSince = null;
        setRequestSent(true);
      } else if (seen) {
        // Reserva: a espera sumiu sem entrar e sem aviso de recusa.
        endedSince ??= Date.now();
        if (Date.now() - endedSince > ENDED_GRACE_MS) {
          setNotice("A espera terminou e você não entrou. Tente novamente.");
        }
      }
      if (lobby.passwordJoinFailed) setNotice("Senha incorreta.");
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  // Dentro da sala (cadastrado): botão flutuante, pedidos e participantes.
  useEffect(() => {
    if (stage !== "member" || !inRoom) return;
    let tick = 0;
    const timer = window.setInterval(() => {
      const instance = api.current;
      if (!instance) return;

      // Rápido: espelha a barra de botões do Jitsi e a posição da barra lateral.
      const visible = readToolboxVisible(instance);
      if (visible !== null) setToolboxVisible((cur) => (cur === visible ? cur : visible));
      const offset = readSidebarOffset(instance);
      if (offset !== null) setSidebarOffset((cur) => (cur === offset ? cur : offset));
      const mod = readLocalIsModerator(instance);
      if (mod !== null) setLocalModerator((cur) => (cur === mod ? cur : mod));
      const reactions = readReactionsMuted(instance);
      if (reactions !== null) setReactionsMutedState((cur) => (cur === reactions ? cur : reactions));
      const flags = readMediaFlags(instance);
      if (flags) setMedia((cur) => (cur && cur.recording === flags.recording ? cur : flags));
      const mst = readMediaStatus(instance);
      if (mst) {
        // Início da gravação: o do Jitsi, ou o instante em que a vimos ligar.
        if (mst.recording !== "on") recordingSeenAt.current = null;
        else if (mst.since === null) mst.since = recordingSeenAt.current ??= Date.now();
        setMediaStatus((cur) => (cur && cur.recording === mst.recording && cur.since === mst.since ? cur : mst));
      }
      const group = readGroupOptions(instance);
      if (group) {
        setGroupOptions((cur) =>
          cur &&
          cur.startAudioMuted === group.startAudioMuted &&
          cur.startVideoMuted === group.startVideoMuted &&
          cur.followMe === group.followMe &&
          cur.followMeRecorder === group.followMeRecorder
            ? cur
            : group,
        );
      }

      // Moderação de áudio (liberado/bloqueado, pedidos de fala): lida a cada 250 ms, junto com a
      // "palavra final" das ações recém-feitas (o Jitsi leva um instante para confirmar).
      const audioMod = withOverrides(readAudioModeration(instance), audioOverrides.current);
      setModeration((cur) => {
        if (!audioMod || !cur) return audioMod ?? null;
        const same =
          cur.enabled === audioMod.enabled &&
          cur.pending.join() === audioMod.pending.join() &&
          cur.approved.join() === audioMod.approved.join();
        return same ? cur : audioMod;
      });

      // Bloqueio de câmera e de compartilhamento (e os pedidos pendentes).
      const mm = readMediaModeration(instance);
      setMediaMod((cur) => (JSON.stringify(cur) === JSON.stringify(mm) ? cur : mm));

      // Lento (1 s): pedidos de entrada (lista oficial do Jitsi) e participantes.
      if (tick++ % SLOW_EVERY !== 0) return;
      const lobby = readLobbyState(instance);
      if (lobby) setWaiting((cur) => (sameIds(cur, lobby.waiting) ? cur : lobby.waiting));

      {
        const list = readParticipants(instance);
        setParticipantsAvailable(list !== null);
        // Pedido atendido que não existe mais (mão baixa e sem pendência): libera o id para um pedido futuro.
        if (list) {
          setDismissed((cur) => {
            if (cur.length === 0) return cur;
            const keep = cur.filter(
              (id) =>
                list.some((p) => p.id === id && p.handRaised) ||
                audioMod?.pending.includes(id) === true ||
                mm?.video.pending.includes(id) === true ||
                mm?.desktop.pending.includes(id) === true,
            );
            return keep.length === cur.length ? cur : keep;
          });
        }
        if (list) {
          setParticipants((cur) => {
            const same =
              cur.length === list.length &&
              cur.every(
                (c, i) =>
                  c.id === list[i].id &&
                  c.name === list[i].name &&
                  c.audioMuted === list[i].audioMuted &&
                  c.videoMuted === list[i].videoMuted &&
                  c.moderator === list[i].moderator &&
                  c.handRaised === list[i].handRaised &&
                  c.sharing === list[i].sharing,
              );
            return same ? cur : list;
          });
        }
      }
    }, FAST_TICK_MS);
    return () => window.clearInterval(timer);
  }, [stage, inRoom]);

  const answer = useCallback((id: string, approved: boolean) => {
    api.current?.executeCommand("answerKnockingParticipant", id, approved);
    setWaiting((list) => list.filter((k) => k.id !== id));
  }, []);

  const toggleMediaMod = useCallback((kind: MediaKind, enabled: boolean) => {
    if (api.current) setMediaModeration(api.current, kind, enabled);
  }, []);

  const approveMediaRequest = useCallback((kind: MediaKind, id: string) => {
    if (api.current) approveMedia(api.current, kind, id);
  }, []);

  const blockMediaRequest = useCallback((kind: MediaKind, id: string) => {
    if (api.current) blockMedia(api.current, kind, id);
  }, []);

  /** Alguém foi liberado: o pedido dele está atendido (a mão baixa e a linha some de Solicitações). */
  const dismissRequest = useCallback((id: string) => {
    setDismissed((cur) => (cur.includes(id) ? cur : [...cur, id]));
    if (api.current) lowerHand(api.current, id);
  }, []);

  const muteAll = useCallback((media: "audio" | "video" | "screenshare") => {
    if (!api.current) return;
    // Modo Apresentador: "silenciar todos" também revoga quem já tinha sido liberado.
    if (media === "audio" && readAudioModeration(api.current)?.enabled) {
      const approved = readAudioModeration(api.current)?.approved ?? [];
      revokeAllAudio(api.current);
      for (const id of approved) {
        audioOverrides.current.set(id, { approved: false, until: Date.now() + OVERRIDE_MS });
      }
    }
    api.current.executeCommand("muteEveryone", media);
  }, []);

  const blockOne = useCallback((id: string) => {
    if (!api.current) return;
    blockAudio(api.current, id);
    audioOverrides.current.set(id, { approved: false, until: Date.now() + OVERRIDE_MS });
  }, []);

  const lowerOne = useCallback((id: string) => {
    if (api.current) lowerHand(api.current, id);
  }, []);

  const muteOne = useCallback((id: string, media: "audio" | "video" | "screenshare") => {
    if (api.current) muteParticipant(api.current, id, media);
  }, []);

  /** "Parar todas as telas, menos esta": encerra o compartilhamento de cada um que está compartilhando, exceto o escolhido. */
  const stopOtherShares = useCallback((keepId: string) => {
    const live = api.current;
    if (!live) return;
    for (const p of readParticipants(live) ?? []) {
      if (p.sharing && p.id !== keepId) muteParticipant(live, p.id, "screenshare");
    }
  }, []);

  const kick = useCallback((id: string) => {
    api.current?.executeCommand("kickParticipant", id);
  }, []);

  const askUnmute = useCallback((id: string) => {
    if (!api.current) return;
    askToUnmute(api.current, id);
    audioOverrides.current.set(id, { approved: true, until: Date.now() + OVERRIDE_MS });
    // Quem foi liberado deixa de aparecer como pedido: baixa a mão levantada.
    lowerHand(api.current, id);
  }, []);

  // Perfil da conta: carrega ao chegar na tela de entrada do cadastrado e sempre que o menu abre (o painel pode tê-lo mudado).
  const loadProfile = useCallback(async () => {
    try {
      const r = await fetch("/flow-api/profile", { cache: "no-store" });
      const d = (await r.json()) as { ok?: boolean } & Partial<MenuProfile>;
      if (d.ok && typeof d.name === "string") {
        setAccount({
          name: d.name,
          photoUrl: d.photoUrl ?? null,
          status: d.status ?? "",
          allowed: d.allowed !== false,
        });
      }
    } catch {
      /* sem o perfil, a tela usa o nome da conta */
    }
  }, []);

  useEffect(() => {
    // O perfil vem do servidor (sistema externo): buscar e guardar no estado é o uso previsto do efeito.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stage === "member-form" || (stage === "member" && panelOpen)) void loadProfile();
  }, [stage, panelOpen, loadProfile]);

  const applyProfile = useCallback(
    (profile: (MenuProfile & { name: string }) | undefined, previous: MenuProfile | null) => {
      if (!profile) return;
      setAccount({ ...profile });
      // O Jitsi também mostra o nome e a foto: atualiza (o servidor impõe os mesmos valores na presença).
      if (profile.name !== previous?.name) api.current?.executeCommand("displayName", profile.name);
      if (profile.photoUrl && profile.photoUrl !== previous?.photoUrl) api.current?.executeCommand("avatarUrl", profile.photoUrl);
    },
    [],
  );

  const saveName = useCallback(
    async (name: string): Promise<ProfileResult> => {
      try {
        const r = await fetch("/flow-api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const d = (await r.json()) as { ok?: boolean; notice?: string; error?: string; profile?: MenuProfile };
        applyProfile(d.profile, account);
        if (d.ok) notify.info("Nome atualizado", d.notice, "profile");
        return { ok: d.ok === true, notice: d.notice, error: d.error };
      } catch {
        return { ok: false, error: "Não foi possível falar com o servidor agora." };
      }
    },
    [account, applyProfile],
  );

  const uploadPhoto = useCallback(
    async (file: File): Promise<ProfileResult> => {
      if (file.size > 2 * 1024 * 1024) return { ok: false, error: "A foto deve ter no máximo 2 MB." };
      try {
        const r = await fetch("/flow-api/profile/photo", {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        });
        const d = (await r.json()) as { ok?: boolean; notice?: string; error?: string; profile?: MenuProfile };
        applyProfile(d.profile, account);
        if (d.ok) notify.info("Foto atualizada", d.notice, "profile");
        return { ok: d.ok === true, notice: d.notice, error: d.error };
      } catch {
        return { ok: false, error: "Não foi possível enviar a foto agora." };
      }
    },
    [account, applyProfile],
  );

  const changeStartMuted = useCallback((kind: "audio" | "video", value: boolean) => {
    if (!api.current) return;
    setStartMuted(api.current, kind, value);
    setGroupOptions((cur) => (cur ? { ...cur, [kind === "audio" ? "startAudioMuted" : "startVideoMuted"]: value } : cur));
  }, []);

  const changeFollowMe = useCallback((kind: "everyone" | "recorder", value: boolean) => {
    if (!api.current) return;
    setFollowMe(api.current, kind, value);
    setGroupOptions((cur) =>
      cur
        ? kind === "everyone"
          ? { ...cur, followMe: value, followMeRecorder: value ? false : cur.followMeRecorder }
          : { ...cur, followMeRecorder: value, followMe: value ? false : cur.followMe }
        : cur,
    );
  }, []);

  const changeMediaFlags = useCallback((flags: MediaFlags) => {
    if (!api.current) return;
    setMediaFlags(api.current, flags);
    setMedia(flags);
    // O gravador só segue enquanto a gravação está liberada.
    if (!flags.recording) setFollowMe(api.current, "recorder", false);
  }, []);

  // Se o serviço não existir no servidor, a gravação nunca liga: avisa em vez de ficar parado.
  const watchMedia = useCallback((wasOn: boolean) => {
    setMediaNote(null);
    window.setTimeout(() => {
      const st = api.current ? readMediaStatus(api.current) : null;
      // Gravação "iniciando" conta como em andamento (o Jibri leva alguns segundos para abrir a sala).
      const isOn = st?.recording === "on" || st?.recording === "pending";
      if (isOn === wasOn) {
        setMediaNote(!wasOn ? "Não foi possível iniciar a gravação. Só moderadores (não interinos) podem gravar." : "Não foi possível parar a gravação agora. Tente de novo.");
      }
    }, 8000);
  }, []);

  // Convidado dentro da sala: só acompanha o estado da gravação (para o aviso e o indicador "Gravando").
  useEffect(() => {
    if (stage !== "guest" || !inRoom) return;
    const timer = window.setInterval(() => {
      const instance = api.current;
      if (!instance) return;
      const mst = readMediaStatus(instance);
      if (mst) setMediaStatus((cur) => (cur && cur.recording === mst.recording ? cur : { ...mst, since: null }));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [stage, inRoom]);

  // Todos os participantes são avisados quando a gravação liga (ou já estava ligada ao entrar) e quando desliga.
  const lastRecording = useRef<"off" | "pending" | "on" | null>(null);
  useEffect(() => {
    const now = mediaStatus?.recording ?? null;
    const prev = lastRecording.current;
    lastRecording.current = now;
    if (now === "on" && prev !== "on") notify.recordingStarted();
    else if (now === "off" && prev === "on") notify.recordingStopped();
  }, [mediaStatus?.recording]);

  const changeRecording = useCallback(
    (start: boolean) => {
      if (!api.current) return;
      setRecording(api.current, start);
      // Avisa o painel quem iniciou (aparece em Gravações > Iniciada por).
      // "Transcrever ao final" liga sozinho ao iniciar a gravação (o moderador pode desligar e religar a qualquer momento).
      if (start) setTranscribeAtEnd(true);
      if (start && room) void fetch(`/flow-api/recording-start?room=${encodeURIComponent(room)}&transcribe=1`, { method: "POST", credentials: "same-origin" }).catch(() => {});
      watchMedia(!start);
    },
    [watchMedia, room],
  );

  // "Transcrever ao final" pode mudar durante a gravação: o painel guarda o valor e usa o do momento em que a gravação termina.
  const changeTranscribeAtEnd = useCallback(
    (on: boolean) => {
      setTranscribeAtEnd(on);
      const recording = mediaStatus?.recording === "on" || mediaStatus?.recording === "pending";
      if (recording && room) void fetch(`/flow-api/recording-transcribe?room=${encodeURIComponent(room)}&on=${on ? "1" : "0"}`, { method: "POST", credentials: "same-origin" }).catch(() => {});
    },
    [mediaStatus?.recording, room],
  );

  const toggleReactions = useCallback((muted: boolean) => {
    if (!api.current) return;
    setReactionsMuted(api.current, muted);
    setReactionsMutedState(muted);
  }, []);

  // Reunião fechada: consulta ao abrir o menu do moderador e a cada 5 s enquanto ele estiver aberto.
  useEffect(() => {
    if (!panelOpen || !room) return;
    let alive = true;
    const load = () =>
      fetch(`/flow-api/closed?room=${encodeURIComponent(room)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { moderator?: boolean; closed?: boolean }) => {
          if (alive) setMeetingClosed(d.moderator === true ? d.closed === true : null);
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [panelOpen, room]);

  // Senha da sala (só moderador recebe): enquanto o menu está aberto, a cada 4 s.
  useEffect(() => {
    if (!panelOpen || !room || !localModerator) return;
    let alive = true;
    const load = () =>
      fetch(`/flow-api/room-password?room=${encodeURIComponent(room)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { moderator?: boolean; enabled?: boolean; password?: string | null; rotatesIn?: number | null }) => {
          if (!alive) return;
          if (d.moderator === true && d.enabled === true) setRoomPassword({ enabled: true, password: d.password ?? null, rotatesIn: d.rotatesIn ?? null, fetchedAt: Date.now() });
          else setRoomPassword(null);
        })
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [panelOpen, room, localModerator]);

  // Modo invisível: a opção só aparece para moderador real, com a conta liberada, nesta sala.
  useEffect(() => {
    if (stage !== "member-form" || !room) return;
    let alive = true;
    fetch(`/flow-api/invisible?room=${encodeURIComponent(room)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { available?: boolean }) => {
        if (alive) setInvisibleAvailable(d.available === true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [stage, room]);

  const toggleClosed = useCallback(
    (closed: boolean) => {
      if (!room) return;
      setMeetingClosed(closed); // otimista; a consulta seguinte confirma
      fetch("/flow-api/closed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room, closed }),
      })
        .then((r) => r.json())
        .then((d: { ok?: boolean; closed?: boolean }) => {
          if (d.ok !== true) {
            setMeetingClosed(!closed);
            notify.error("Não foi possível alterar a reunião agora.");
          }
        })
        .catch(() => setMeetingClosed(!closed));
    },
    [room],
  );

  const toggleModeration = useCallback((enabled: boolean) => {
    if (!api.current) return;
    const instance = api.current;
    audioOverrides.current.clear();
    setAudioModeration(instance, enabled);
    if (!enabled) return;
    // Ao ligar o Modo Apresentador todos começam bloqueados (ver `revokeAllAudio`). Espera o modo
    // confirmar que ligou; antes disso o servidor trataria o pedido de outra forma.
    const until = Date.now() + OVERRIDE_MS;
    for (const p of readParticipants(instance) ?? []) {
      if (!p.moderator) audioOverrides.current.set(p.id, { approved: false, until });
    }
    let tries = 0;
    const wait = window.setInterval(() => {
      if (api.current !== instance || ++tries > 30) return window.clearInterval(wait);
      if (!readAudioModeration(instance)?.enabled) return;
      window.clearInterval(wait);
      revokeAllAudio(instance, true);
      window.setTimeout(() => {
        if (api.current === instance) revokeAllAudio(instance, true);
      }, 1000);
    }, 150);
  }, []);

  const requests = useMemo(
    () =>
      Array.from(
        new Set([
          ...(moderation?.pending ?? []),
          ...(mediaMod?.video.enabled ? mediaMod.video.pending : []),
          ...(mediaMod?.desktop.enabled ? mediaMod.desktop.pending : []),
          ...participants.filter((p) => p.handRaised).map((p) => p.id),
        ]),
      ).filter((id) => !dismissed.includes(id)),
    [moderation, mediaMod, participants, dismissed],
  );

  useEffect(() => {
    isModerator.current = localModerator;
  }, [localModerator]);

  useEffect(() => {
    sessionFailedRef.current = sessionFailed;
  }, [sessionFailed]);

  // Marca d'água da reunião: o logo da marca (versão para fundo escuro) no canto, translúcido e sem capturar cliques.
  const brand = useBrand();
  const logoVersion = brand.logoDarkVersion ?? brand.logoLightVersion;
  const meetingLogo = logoVersion === null ? null : brandUrl(brand.logoDarkVersion !== null ? "logo_dark" : "logo_light", logoVersion);

  const joinConfig = useMemo(
    () => ({
      prejoinConfig: { enabled: false },
      // Reunião encerrada para todos: sem o diálogo nativo "A chamada foi encerrada" (a tela de saída é nossa).
      notifyOnConferenceDestruction: false,
      defaultLogoUrl: "/_flow/blank.svg",
      // Compartilhamento de tela: quadros por segundo definidos no painel (o Jitsi vem com 5).
      desktopSharingFrameRate: { min: Math.min(5, brand.shareFps), max: brand.shareFps },
      disableDeepLinking: true,
      startWithAudioMuted: prejoin?.audioMuted ?? true,
      startWithVideoMuted: prejoin?.videoMuted ?? true,
      // Convidado pede entrada sozinho; cadastrado não passa pela sala de espera.
      lobby: { autoKnock: stage === "guest" || stage === "member" },
      // Notificações nativas do Jitsi desativadas (não criadas). Os avisos são nossos, disparados
      // pelos eventos da IFrame API (inclusive `notificationTriggered`, que continua chegando).
      notifications: [],
      // Segurança da sala é decidida pelo servidor (sala de espera sempre ligada, senha fixa): a
      // interface não oferece esses controles. O servidor também ignora comandos diretos (room_guard).
      securityUi: { hideLobbyButton: true, disableLobbyPassword: true },
      // Entrou invisível: sem aparelhos (nada é capturado nem enviado), sem chat, mão, reações e compartilhamentos.
      ...(prejoin?.invisible
        ? {
            disableInitialGUM: true,
            // Sem a aba "Fundos virtuais" nas configurações (não há câmera).
            virtualBackground: { disabled: true },
            disableReactions: true,
            disablePolls: true,
            toolbarButtons: TOOLBAR_BUTTONS.filter(
              (b) => !["camera", "microphone", "chat", "desktop", "raisehand", "closedcaptions", "shareaudio", "sharedvideo", "toggle-camera", "whiteboard", "etherpad", "select-background", "highlight", "download", "noisesuppression"].includes(b),
            ),
          }
        : { toolbarButtons: TOOLBAR_BUTTONS }),
      // Regras, permissões e privilégios só mudam pelo painel: ninguém promove outra pessoa dentro da sala.
      remoteVideoMenu: { disableGrantModerator: true },
      // Nome travado para quem está logado (só muda no menu Perfil, com a política de trocas); convidado digita o nome dele.
      readOnlyName: stage === "member" || stage === "guest",
      // Nunca pedimos e-mail de Gravatar.
      hideEmailInSettings: true,
      // Salas paralelas (breakout) não existem: o servidor só abre as salas cadastradas no painel.
      breakoutRooms: { hideAddRoomButton: true, hideAutoAssignButton: true, hideJoinRoomButton: true },
    }),
    [prejoin, stage, brand.shareFps],
  );

  // Abas da janela nativa de configurações: sem "Moderador" (o menu da sala cuida de tudo isso).
  // Ninguém tem a aba "Perfil" nativa: o nome do convidado é definido só na entrada; o do cadastrado, no menu da sala.
  const interfaceConfig = useMemo(
    () => ({
      // O logo do Jitsi não aparece: a marca d'água é nossa (veja abaixo), por cima da reunião. "SHOW_JITSI_WATERMARK: false" não o esconde
      // nesta versão; o que funciona é trocar a imagem dele por uma transparente (e o clique da caixa vazia não leva ao site do Jitsi).
      SHOW_JITSI_WATERMARK: false,
      JITSI_WATERMARK_LINK: "/",
      // Invisível: sem "devices" (abas Áudio e Vídeo): ele não usa câmera nem microfone.
      SETTINGS_SECTIONS: [
        ...(prejoin?.invisible ? [] : ["devices"]),
        "language",
        "sounds",
        "more",
        "shortcuts",
      ],
    }),
    [prejoin?.invisible],
  );


  if (!room) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Sala inválida</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use apenas letras, números, &quot;-&quot; e &quot;_&quot; no nome da sala.
        </p>
        {/* Link de PÁGINA INTEIRA de propósito: Link/router.push fazem fetch (não é
            "documento") e o Traefik os mandaria ao Jitsi. */}
        <Button
          size="lg"
          className="mt-6"
          render={
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a href="/" />
          }
        >
          Voltar
        </Button>
      </Shell>
    );
  }

  const isMember = stage === "member" && prejoin !== null;
  const isGuest = stage === "guest" && prejoin !== null;
  const frameVisible = inRoom && (isMember || isGuest);
  const showFab = isMember && inRoom;
  /** Moderador (ou interino em exercício): vê Moderação e Configurações da sala. Os demais só o Perfil. */
  const privileged = localModerator;
  const fabShown = toolboxVisible || panelOpen;
  /** Pedidos pendentes: entrada na sala + microfone. */
  // Pedidos de liberação só existem com algum bloqueio ligado (microfone, câmera ou tela).
  const speechRequests = moderation?.enabled || mediaMod?.video.enabled || mediaMod?.desktop.enabled ? requests : [];
  const alerts = privileged ? waiting.length + speechRequests.length : 0;

  return (
    <>
      {(isMember || isGuest) && (
        <div
          ref={frameBox}
          className={
            frameVisible && !exiting
              ? "fixed inset-0 z-0"
              : // Fora da tela, mas com tamanho real: o Jitsi se comporta como em tela cheia.
                "pointer-events-none fixed left-[-10000px] top-0 h-[720px] w-[1280px] opacity-0"
          }
          aria-hidden={!frameVisible}
        >
          <JitsiFrame
            key={`${room}:${stage}`}
            room={room}
            displayName={prejoin.name}
            config={joinConfig}
            interfaceConfig={interfaceConfig}
            devices={prejoin.devices}
            events={isMember ? MEMBER_EVENTS : GUEST_EVENTS}
            onReady={(instance) => {
              api.current = instance;
              setApiReady(true);
            }}
            onEvent={onEvent}
          />
          {frameVisible && mediaStatus?.recording === "on" && (
            <div
              role="status"
              className="pointer-events-none absolute top-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white shadow-sm"
            >
              <span className="size-2 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
              Gravando
            </div>
          )}
          {frameVisible && meetingLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={meetingLogo}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute top-5 left-9 z-10 h-[52px] max-w-48 object-contain object-left opacity-35 drop-shadow-[0_1px_3px_rgb(0_0_0/0.45)]"
            />
          )}
        </div>
      )}

      <Toaster position="bottom-left" visibleToasts={3} offset={{ bottom: 96, left: 16 }} />

      {showFab && (
        <>
          {/*
            Botão flutuante: só existe dentro da sala e para moderador. Aparece e some junto com
            a barra de botões do próprio Jitsi (mouse parado = some). A posição lateral vem do
            DOM do Jitsi (fica À ESQUERDA da barra lateral) e anima só por transform/opacity.
          */}
          <div
            className={cn(
              "fixed right-4 bottom-6 z-40 transition-[transform,opacity] duration-[380ms] ease-[var(--ease-drawer)]",
              fabShown ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            style={{ transform: `translate(-${sidebarOffset}px, ${fabShown ? 0 : 8}px)` }}
          >
            <Button
              type="button"
              size="icon-lg"
              className="size-12 rounded-full shadow-xl"
              tabIndex={fabShown ? 0 : -1}
              aria-label={privileged ? (alerts > 0 ? `Moderação: ${alerts} pedido(s) pendente(s)` : "Moderação") : "Meu perfil"}
              onClick={() => setPanelOpen(true)}
            >
              <SlidersHorizontalIcon className="size-6" />
            </Button>
            {prejoin?.invisible && (
              <>
                {/* Observador invisível: botão cinza logo acima do de opções (30 px de vão), que pede confirmação antes de sair do modo. */}
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-lg"
                  className="absolute right-0 bottom-full mb-[30px] size-12 rounded-full shadow-xl"
                  tabIndex={fabShown ? 0 : -1}
                  aria-label="Sair do modo invisível"
                  aria-expanded={confirmLeaveInvisible}
                  title="Sair do modo invisível"
                  onClick={() => setConfirmLeaveInvisible((v) => !v)}
                >
                  <EyeIcon className="size-6" />
                </Button>
                {confirmLeaveInvisible && (
                  <div
                    role="alertdialog"
                    aria-label="Sair do modo invisível"
                    className="animate-in fade-in-0 zoom-in-95 absolute right-14 bottom-full mb-[30px] w-64 origin-bottom-right rounded-xl border bg-popover p-3 text-sm text-popover-foreground shadow-xl duration-150"
                  >
                    <p className="leading-snug">Sair do modo invisível? Você passa a aparecer para todos e volta à etapa de câmera e microfone.</p>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setConfirmLeaveInvisible(false)}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={() => void leaveInvisible()}>
                        Sair do modo
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            {alerts > 0 && (
              // key=contagem: o selo "estala" de novo a cada pedido novo (escala 0.75 -> 1, nunca de 0).
              <Badge
                key={alerts}
                variant="destructive"
                className="animate-in zoom-in-75 fade-in-0 pointer-events-none absolute -top-1.5 -right-1.5 h-5 min-w-5 justify-center bg-red-500 px-1 text-white duration-200 ease-[var(--ease-out)]"
              >
                {alerts > 9 ? "9+" : alerts}
              </Badge>
            )}
          </div>

          <RoomMenu
            open={panelOpen}
            privileged={privileged}
            fullAccess={realModerator}
            reactionsMuted={reactionsMuted}
            profile={account}
            onToggleReactions={toggleReactions}
            groupOptions={groupOptions}
            onStartMuted={changeStartMuted}
            onFollowMe={changeFollowMe}
            roomPassword={roomPassword}
            media={media}
            onMediaFlags={changeMediaFlags}
            mediaStatus={mediaStatus}
            mediaNote={mediaNote}
            onRecording={changeRecording}
            transcribeAtEnd={transcribeAtEnd}
            onTranscribeAtEnd={changeTranscribeAtEnd}
            onSaveName={saveName}
            onUploadPhoto={uploadPhoto}
            waiting={waiting}
            participants={participants}
            moderation={moderation}
            mediaMod={mediaMod}
            onToggleMediaMod={toggleMediaMod}
            onApproveMedia={approveMediaRequest}
            onBlockMedia={blockMediaRequest}
            onDismissRequest={dismissRequest}
            requests={speechRequests}
            participantsAvailable={participantsAvailable}
            onOpenChange={setPanelOpen}
            onAnswer={answer}
            onMuteAll={muteAll}
            onMuteOne={muteOne}
            onStopOtherShares={stopOtherShares}
            onAskToUnmute={askUnmute}
            onBlock={blockOne}
            onLowerHand={lowerOne}
            onToggleModeration={toggleModeration}
            closed={meetingClosed}
            onToggleClosed={toggleClosed}
            onKick={kick}
            onLeave={() => leave()}
            onLogout={logout}
          />
        </>
      )}

      {stage === "left" && <ExitScreen reason={exitReason} room={room ?? ""} onReturn={returnToRoom} />}

      {ready && stage === "choose" && (
        <Shell key="choose">
          <p className="text-center text-xs tracking-widest text-muted-foreground uppercase">Sala</p>
          <h1 className="mt-1 text-center text-2xl font-semibold">{room}</h1>
          {roomInfo?.exists === false ? (
            <>
            <Alert variant="destructive" className="mt-4" role="alert">
              <CircleAlertIcon />
              <AlertDescription>Esta sala não existe. Confira o endereço com quem convidou você.</AlertDescription>
            </Alert>
            <Button size="lg" variant="outline" className="mt-6 w-full" onClick={goHome}>
              Ir para a página de entrada
            </Button>
            </>
          ) : roomInfo?.expired ? (
            <>
            <Alert variant="destructive" className="mt-4" role="alert">
              <CircleAlertIcon />
              <AlertDescription>Esta sala temporária expirou e não abre mais reuniões. Peça um novo endereço a quem convidou você.</AlertDescription>
            </Alert>
            <Button size="lg" variant="outline" className="mt-6 w-full" onClick={goHome}>
              Ir para a página de entrada
            </Button>
            </>
          ) : (
            <>
              <p className="mt-4 text-center text-sm text-muted-foreground">Como você quer entrar?</p>
              {roomInfo?.exclusive && (
                <Alert className="mt-4" role="status">
                  <CircleAlertIcon />
                  <AlertDescription>Sala exclusiva: só entram contas cadastradas com acesso a ela.</AlertDescription>
                </Alert>
              )}
              <div className="mt-6 grid gap-3">
                <Button size="lg" onClick={() => setStage("login")}>
                  Sou cadastrado
                </Button>
                {!roomInfo?.exclusive && (
                  <Button size="lg" variant="secondary" onClick={() => setStage("guest-form")}>
                    Sou convidado
                  </Button>
                )}
              </div>
            </>
          )}
        </Shell>
      )}

      {stage === "login" && (
        <Shell key="login">
          <LoginForm
            room={room}
            error={loginError}
            onCancel={() => leave()}
            onSubmit={async (user, pass) => {
              if (loggingIn.current) return;
              loggingIn.current = true;
              setLoginError(null);
              try {
                // O login é conferido NO SERVIDOR antes de abrir o Jitsi: a senha confere e o navegador
                // fica ligado à conta. O Prosody decide o resto (moderador / usuário comum / convidado).
                await prepareCookies();
                const res = await fetch("/flow-api/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "same-origin",
                  cache: "no-store",
                  body: JSON.stringify({ room, user, password: pass }),
                });
                const data = (await res.json().catch(() => ({}))) as {
                  ok?: boolean;
                  error?: string;
                  user?: string;
                  level?: "moderator" | "member" | "none";
                  exclusive?: boolean;
                };
                if (!res.ok || !data.ok || !data.user) {
                  setLoginError(data.error ?? "Não foi possível entrar agora. Tente novamente.");
                  return;
                }
                if (data.level === "none") {
                  if (data.exclusive) {
                    setLoginError("Esta sala é exclusiva e a sua conta não tem acesso a ela.");
                    return;
                  }
                  // Sem acesso a esta sala: entra como convidado (sala de espera), sem privilégios.
                  setGuestName(data.user);
                  setStage("guest-form");
                  return;
                }
                memberLevelRef.current = data.level ?? null;
                saveMember(data.user);
                setMemberUser(data.user);
                setResume(true);
                setStage("member-form");
              } catch {
                setLoginError("Não foi possível entrar agora. Tente novamente.");
              } finally {
                loggingIn.current = false;
              }
            }}
          />
        </Shell>
      )}

      {(stage === "member-form" || stage === "guest-form") && (
        <Shell key={stage} lite>
          <PrejoinForm
            room={room}
            key={stage === "member-form" ? `member:${account?.name ?? ""}` : "guest"}
            initialName={stage === "member-form" ? (account?.name ?? memberUser) : guestName}
            nameLocked={stage === "member-form"}
            passwordEnabled={stage === "guest-form" && roomInfo?.password === true}
            invisibleAvailable={stage === "member-form" && invisibleAvailable}
            submitError={entryError}
            busy={entryBusy}
            submitLabel={stage === "member-form" ? "Entrar na sala" : "Solicitar entrada"}
            onCancel={
              stage === "member-form" ? () => (resume ? leave() : setStage("login")) : () => leave()
            }
            onSubmit={(result) => {
              setEntryError(null);
              const go = () => {
                setPrejoin(result);
                setApiReady(false);
                if (stage === "member-form") {
                  // Cadastrado: cookies do painel (com a intenção de retomada, se for o caso) e sem
                  // session-id antigo do Jitsi, que faria o Jicofo recusar o login.
                  dropStaleJitsiSession();
                  void prepareCookies({ resume }).finally(() => setStage("member"));
                  return;
                }
                // Convidado: garante o cookie do passe de reconexão (sem intenção de retomada).
                void prepareCookies().finally(() => setStage("guest"));
              };
              if (stage === "member-form") {
                // Modo invisível: o pedido (ou o cancelamento de um pedido antigo) vai ao servidor ANTES de entrar na sala.
                if (!invisibleAvailable) return go();
                setEntryBusy(true);
                void fetch("/flow-api/invisible", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "same-origin",
                  body: JSON.stringify({ room, on: result.invisible === true }),
                })
                  .then((r) => r.json())
                  .then((d: { on?: boolean }) => {
                    if (result.invisible === true && d.on !== true) {
                      setEntryError("Não foi possível entrar invisível agora. Entre sem a opção ou tente de novo.");
                      return;
                    }
                    go();
                  })
                  .catch(() => setEntryError("Não foi possível falar com o servidor agora. Tente de novo."))
                  .finally(() => setEntryBusy(false));
                return;
              }
              if (result.password) {
                // Convidado com a senha da sala: o servidor confere AGORA; se valer, o navegador entra direto, sem aprovação.
                setEntryBusy(true);
                void prepareCookies()
                  .then(() =>
                    fetch("/flow-api/room-password", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "same-origin",
                      body: JSON.stringify({ room, password: result.password }),
                    }),
                  )
                  .then(async (r) => ({ status: r.status, d: (await r.json().catch(() => ({}))) as { granted?: boolean; reason?: string; error?: string } }))
                  .then(({ status, d }) => {
                    if (d.granted === true) return go();
                    if (status === 429) return setEntryError(d.error ?? "Muitas tentativas. Aguarde alguns minutos.");
                    setEntryError(PASSWORD_MESSAGES[d.reason ?? "senha"] ?? PASSWORD_MESSAGES.senha);
                  })
                  .catch(() => setEntryError("Não foi possível falar com o servidor agora. Tente de novo."))
                  .finally(() => setEntryBusy(false));
                return;
              }
              go();
            }}
          />
          {stage === "member-form" && resume && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Entrando como <strong>{memberUser}</strong>.{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => {
                  clearMember();
                  void prepareCookies({ reset: true });
                  setResume(false);
                  setMemberUser("");
                  setStage("login");
                }}
              >
                Não é você? Entrar com outra conta
              </button>
            </p>
          )}
        </Shell>
      )}

      {isMember && !inRoom && (
        <Shell key="member-wait">
          <div className="flex items-center justify-center gap-3">
            <LoaderCircleIcon
              className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-hidden="true"
            />
            <h1 className="text-xl font-semibold">{memberWaiting ? "Aguarde a autorização" : "Entrando na sala"}</h1>
          </div>
          <p className="mt-3 text-center text-sm text-muted-foreground" aria-live="polite">
            {memberWaiting ? (
              <>
                A reunião da sala <strong>{room}</strong> está fechada. Seu pedido foi enviado: esta janela se atualiza sozinha
                assim que um moderador autorizar.
              </>
            ) : (
              <>
                Validando o seu acesso à sala <strong>{room}</strong>…
              </>
            )}
          </p>
          <Button variant="ghost" size="lg" className="mt-6 w-full" onClick={() => leave()}>
            Cancelar
          </Button>
        </Shell>
      )}

      {isGuest && !inRoom && (
        <Shell key={notice ? "guest-error" : needsPassword ? "guest-password" : "guest-wait"}>
          {notice ? (
            <>
              <h1 className="text-center text-xl font-semibold">Não foi possível entrar</h1>
              <Alert variant="destructive" className="mt-4">
                <CircleAlertIcon />
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
              <div className="mt-6 grid gap-3">
                <Button size="lg" onClick={() => leave()}>
                  Tentar novamente
                </Button>
                <Button size="lg" variant="ghost" onClick={goHome}>
                  Ir para a página de entrada
                </Button>
              </div>
            </>
          ) : needsPassword ? (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!password) return;
                api.current?.executeCommand("password", password);
                setPassword("");
              }}
            >
              <h1 className="text-center text-xl font-semibold">Sala protegida</h1>
              <div className="grid gap-2">
                <Label htmlFor="room-password">Esta sala pede uma senha</Label>
                <Input
                  id="room-password"
                  type="password"
                  value={password}
                  autoFocus
                  autoComplete="off"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" size="lg" disabled={!password}>
                Enviar senha
              </Button>
            </form>
          ) : (
            <>
              <div className="flex items-center justify-center gap-3">
                <LoaderCircleIcon
                  className="size-5 animate-spin text-muted-foreground motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <h1 className="text-xl font-semibold">Aguarde a autorização</h1>
              </div>
              <p className="mt-3 text-center text-sm text-muted-foreground" aria-live="polite">
                {requestSent ? (
                  <>
                    Seu pedido foi enviado para a sala <strong>{room}</strong>. Esta janela se
                    atualiza sozinha assim que um moderador autorizar.
                  </>
                ) : (
                  <>
                    Conectando à sala <strong>{room}</strong>. Se o moderador ainda não abriu a
                    sala, aguarde: você entrará assim que ela estiver aberta e for autorizado.
                  </>
                )}
              </p>
            </>
          )}

          <Button variant="ghost" size="lg" className="mt-6 w-full" onClick={() => leave()}>
            {notice ? "Voltar" : "Cancelar"}
          </Button>
        </Shell>
      )}
    </>
  );
}
