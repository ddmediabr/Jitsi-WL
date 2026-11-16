"use client";

import { useEffect, useRef, useState } from "react";
import {
  HandIcon,
  LogOutIcon,
  MicIcon,
  MicOffIcon,
  CaptionsIcon,
  CircleDotIcon,
  CameraOffIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  EllipsisIcon,
  MonitorOffIcon,
  PresentationIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  VideoIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SquareIcon,
  UserRoundIcon,
  UsersIcon,
  VideoOffIcon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ListItem, Pop } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { AudioModeration, MediaKind, MediaModeration, RoomParticipant, WaitingParticipant } from "@/lib/jitsi";

/** Perfil da conta logada (nome, foto e situação da política de trocas), como o painel devolve. */
export type MenuProfile = {
  name: string;
  photoUrl: string | null;
  /** Situação da política de trocas (nome e foto dividem o mesmo contador). */
  status: string;
  allowed: boolean;
};
export type ProfileResult = { ok: boolean; notice?: string; error?: string };

type Props = {
  open: boolean;
  /** Moderador ou moderador interino em exercício: vê as abas Moderação e Configurações da sala. Os demais veem só o Perfil. */
  privileged: boolean;
  /** Moderador REAL da sala (não interino): só ele vê Configurações da sala e os controles de gravação. */
  fullAccess: boolean;
  waiting: WaitingParticipant[];
  participants: RoomParticipant[];
  /** null quando o estado de moderação do Jitsi não pôde ser lido. */
  moderation: AudioModeration | null;
  /** Moderação de câmera e de compartilhamento de tela; null = sem informação. */
  mediaMod: MediaModeration | null;
  onToggleMediaMod: (kind: MediaKind, enabled: boolean) => void;
  onApproveMedia: (kind: MediaKind, id: string) => void;
  /** Volta a bloquear a câmera ou a tela de um participante. */
  onBlockMedia: (kind: MediaKind, id: string) => void;
  /** Pedido atendido: some de Solicitações (a mão baixa). */
  onDismissRequest: (id: string) => void;
  /** Quem pediu a palavra: tentou ligar o microfone (bloqueado) ou levantou a mão. */
  requests: string[];
  /** false quando o estado interno do Jitsi não pôde ser lido. */
  participantsAvailable: boolean;
  /** "Silenciar sons de reação": null = sem informação. */
  reactionsMuted: boolean | null;
  /** Reunião fechada: null = ainda não consultada (ou indisponível). */
  closed: boolean | null;
  profile: MenuProfile | null;
  onOpenChange: (open: boolean) => void;
  onAnswer: (id: string, approved: boolean) => void;
  onMuteAll: (media: "audio" | "video" | "screenshare") => void;
  onMuteOne: (id: string, media: "audio" | "video" | "screenshare") => void;
  /** Encerra o compartilhamento de todos, menos o deste participante. */
  onStopOtherShares: (id: string) => void;
  onAskToUnmute: (id: string) => void;
  onBlock: (id: string) => void;
  onLowerHand: (id: string) => void;
  onToggleModeration: (enabled: boolean) => void;
  onToggleReactions: (muted: boolean) => void;
  /** Opções de grupo do Jitsi (todos iniciam silenciados/ocultos, todos me seguem, gravador me segue); null = sem informação. */
  groupOptions: { startAudioMuted: boolean; startVideoMuted: boolean; followMe: boolean; followMeRecorder: boolean } | null;
  onStartMuted: (kind: "audio" | "video", value: boolean) => void;
  onFollowMe: (kind: "everyone" | "recorder", value: boolean) => void;
  /** Senha de entrada da sala (só quando a opção está ligada e quem vê é moderador); null = sem senha. */
  roomPassword: { enabled: boolean; password: string | null; rotatesIn: number | null; fetchedAt: number } | null;
  /** O que o moderador liberou (gravação); null = sem informação. */
  media: { recording: boolean } | null;
  onMediaFlags: (flags: { recording: boolean }) => void;
  /** Situação real da gravação no Jitsi. */
  mediaStatus: { recording: "off" | "pending" | "on"; since: number | null } | null;
  /** Aviso sobre a gravação (ex.: serviço indisponível). */
  mediaNote: string | null;
  onRecording: (start: boolean) => void;
  /** "Transcrever ao final": vale o estado do botão no momento em que a gravação termina. */
  transcribeAtEnd: boolean;
  onTranscribeAtEnd: (v: boolean) => void;
  onToggleClosed: (closed: boolean) => void;
  onKick: (id: string) => void;
  onLeave: () => void;
  /** Encerra a sessão da conta (no servidor) e sai da sala. */
  onLogout: () => void;
  onSaveName: (name: string) => Promise<ProfileResult>;
  onUploadPhoto: (file: File) => Promise<ProfileResult>;
};

type Tab = "moderation" | "room" | "profile";

const ITEM = "rounded-xl bg-muted/50 p-3";
const HEADING = "flex items-center gap-2 text-xs font-medium tracking-widest text-muted-foreground uppercase";

/** Selo de status: círculo só com ícone (o texto vai em title/aria-label). */
function StatusDot({ label, className, children }: { label: string; className: string; children: React.ReactNode }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-flex size-6 items-center justify-center rounded-full [&_svg]:size-3.5", className)}
    >
      {children}
    </span>
  );
}

/** Botão de função do participante: só o ícone; ao passar o mouse (ou focar) abre para o lado e mostra o texto. */
function Chip({
  icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Em destaque (ex.: pedido a atender). */
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onClick?.();
      }}
      className={cn(
        "group/chip inline-flex h-8 items-center rounded-lg px-2 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0",
        active ? "bg-primary text-primary-foreground ring-2 ring-primary/40 hover:bg-primary/90" : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {icon}
      <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,margin,opacity] duration-200 ease-out group-hover/chip:ml-1.5 group-hover/chip:max-w-48 group-hover/chip:opacity-100 group-focus-visible/chip:ml-1.5 group-focus-visible/chip:max-w-48 group-focus-visible/chip:opacity-100 motion-reduce:transition-none">
        {label}
      </span>
    </button>
  );
}

/** Selo de bloqueio: vermelho (cortado) ou verde (liberado), com o ícone da função (riscado quando cortada). */
function LockDot({ off, offLabel, onLabel, offIcon, onIcon }: { off: boolean; offLabel: string; onLabel: string; offIcon: React.ReactNode; onIcon: React.ReactNode }) {
  return (
    <Pop>
      <StatusDot
        label={off ? offLabel : onLabel}
        className={off ? "bg-red-500/20 text-red-600 dark:text-red-400" : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"}
      >
        {off ? offIcon : onIcon}
      </StatusDot>
    </Pop>
  );
}

/** Botão de alternar: aceso (cor de destaque) quando a opção está ligada. */
function ToggleButton({
  icon,
  label,
  hint,
  on,
  disabled,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  /** Sem `on`, é um botão de ação (clica e pronto), não um liga/desliga. */
  on?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on === undefined ? undefined : on}
      title={hint}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-center text-xs leading-tight font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5",
        on === true ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SwitchRow({
  id,
  title,
  text,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  text: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-muted/50 p-3">
      <div className="grid gap-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {title}
        </Label>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

/** Senha de entrada da sala: código para copiar e contagem até a próxima troca. */
function PasswordBox({ info }: { info: NonNullable<Props["roomPassword"]> }) {
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = info.rotatesIn === null ? null : Math.max(0, info.rotatesIn - Math.floor((now - info.fetchedAt) / 1000));
  const mm = left === null ? "--" : String(Math.floor(left / 60)).padStart(2, "0");
  const ss = left === null ? "--" : String(left % 60).padStart(2, "0");
  return (
    <section className="grid gap-3">
      <h3 className={HEADING}>Senha de entrada</h3>
      {info.password === null ? (
        <p className="text-sm text-muted-foreground">A senha aparece quando a reunião começa.</p>
      ) : (
        <div className={`${ITEM} grid gap-2`}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-2xl font-semibold tracking-[0.25em] select-all" aria-label={`Senha da sala: ${info.password.split("").join(" ")}`}>
              {info.password}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(info.password ?? "").then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                });
              }}
            >
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <p className="text-xs leading-normal text-muted-foreground">
            Troca em <span className="font-mono tabular-nums">{mm}:{ss}</span>. Passe a senha a quem deve entrar sem aprovação: ela vale só na entrada e a anterior deixa de valer na hora da troca.
          </p>
        </div>
      )}
    </section>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** Cronômetro e avisos da gravação. O relógio só corre enquanto a gravação está ligada. */
function MediaInfo({ status, note }: { status: Props["mediaStatus"]; note: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  const on = status?.recording === "on";
  useEffect(() => {
    if (!on) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [on]);
  const elapsed = on && status?.since ? formatElapsed(now - status.since) : "00:00:00";
  return (
    <div className="grid gap-1 rounded-xl bg-muted/50 p-3 text-xs leading-normal text-muted-foreground">
      <div className="flex items-center justify-between gap-3">
        <span>Tempo de gravação</span>
        <span className={cn("font-mono text-sm tabular-nums", on ? "text-red-600 dark:text-red-400" : "text-foreground")}>{elapsed}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span>Gravação</span>
        <span>{status?.recording === "on" ? "Gravando" : status?.recording === "pending" ? "Iniciando…" : "Parada"}</span>
      </div>
      {note && (
        <p role="status" className="pt-1 text-amber-600 dark:text-amber-400">
          {note}
        </p>
      )}
    </div>
  );
}

/**
 * Barra de saída: recolhida por padrão; só a seta encostada no fim do painel. Ao abrir, aparece POR CIMA do conteúdo
 * (não ocupa espaço) com o botão "Sair da sala", a 16 px do fim, como as abas ficam a 16 px do topo.
 */
function LeaveBar({ onLeave }: { onLeave: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center">
      <button
        type="button"
        aria-label={open ? "Recolher opções de saída" : "Mostrar opções de saída"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex h-5 w-14 items-center justify-center rounded-t-lg border border-b-0 bg-popover text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4"
      >
        {open ? <ChevronDownIcon /> : <ChevronUpIcon />}
      </button>
      {open && (
        <div className="animate-in fade-in-0 slide-in-from-bottom-2 pointer-events-auto grid w-full border-t bg-popover p-4 shadow-[0_-12px_24px_-12px_rgb(0_0_0/0.35)] duration-150">
          <Button variant="outline" size="lg" onClick={onLeave}>
            <LogOutIcon /> Sair da sala
          </Button>
        </div>
      )}
    </div>
  );
}

/** Menu da sala (botão flutuante): Moderação, Configurações da sala e Perfil. Quem não tem privilégio vê só o Perfil. */
export default function RoomMenu(props: Props) {
  const { open, privileged, fullAccess, profile } = props;
  const [tab, setTab] = useState<Tab>("moderation");
  // Sem privilégio (ou ao perder o privilégio no meio da reunião) só existe o Perfil; interino não tem Configurações da sala.
  const active: Tab = !privileged ? "profile" : tab === "room" && !fullAccess ? "moderation" : tab;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "moderation", label: "Moderação", icon: <ShieldCheckIcon /> },
    ...(fullAccess ? [{ id: "room" as const, label: "Configurações da sala", icon: <SettingsIcon /> }] : []),
    { id: "profile", label: "Perfil", icon: <UserRoundIcon /> },
  ];

  return (
    <Sheet open={open} onOpenChange={props.onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 data-[side=right]:sm:max-w-md">
        <SheetTitle className="sr-only">Menu da sala</SheetTitle>

        {privileged && (
          <div role="tablist" aria-label="Menu da sala" className="flex gap-1 px-2 pt-4 pb-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                id={`tab-${t.id}`}
                aria-selected={active === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex min-w-18 flex-auto flex-col items-center gap-1 rounded-lg px-3 py-2 text-xs leading-tight font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-5",
                  active === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t.icon}
                <span className="whitespace-nowrap">{t.label}</span>
              </button>
            ))}
          </div>
        )}

        <ScrollArea className="min-h-0 flex-1">
          <div role="tabpanel" id={`panel-${active}`} aria-labelledby={privileged ? `tab-${active}` : undefined} className={cn("grid gap-6 p-4 pb-10", privileged ? "pt-6" : "pt-4")}>
            {active === "moderation" && <ModerationTab {...props} />}
            {active === "room" && <RoomTab {...props} />}
            {active === "profile" && <ProfileTab profile={profile} onSaveName={props.onSaveName} onUploadPhoto={props.onUploadPhoto} onLogout={props.onLogout} open={open} />}
          </div>
        </ScrollArea>

        <LeaveBar onLeave={props.onLeave} />
      </SheetContent>
    </Sheet>
  );
}

/* --------------------------------- Moderação --------------------------------- */

function ModerationTab({
  waiting,
  participants,
  moderation,
  mediaMod,
  onToggleMediaMod,
  onApproveMedia,
  onBlockMedia,
  onDismissRequest,
  onToggleModeration,
  requests,
  participantsAvailable,
  reactionsMuted,
  groupOptions,
  onFollowMe,
  roomPassword,
  fullAccess,
  media,
  mediaStatus,
  mediaNote,
  onRecording,
  transcribeAtEnd,
  onTranscribeAtEnd,
  onAnswer,
  onMuteAll,
  onMuteOne,
  onStopOtherShares,
  onAskToUnmute,
  onBlock,
  onLowerHand,
  onToggleReactions,
  onKick,
}: Props) {
  // Pedido em atendimento: o menu rola até o cartão da pessoa e o botão de opções vira uma mão levantada.
  const [attending, setAttending] = useState<string | null>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  // O destaque some sozinho quando o pedido deixa de existir (mão baixada ou atendida).
  const attendingId = attending !== null && requests.includes(attending) ? attending : null;
  const byId = (id: string) => participants.find((p) => p.id === id);
  const moderated = moderation?.enabled === true;
  // O pedido é sempre a mão levantada. Cada bloqueio ligado (microfone, câmera, tela) mostra o seu botão de liberar.
  const videoOn = mediaMod?.video.enabled === true;
  const desktopOn = mediaMod?.desktop.enabled === true;
  const blockCount = [moderated, videoOn, desktopOn].filter(Boolean).length;
  const requestCount = blockCount > 0 ? requests.length : 0;
  return (
    <>
      <section className="grid gap-3">
        <h3 className={HEADING}>
          Pedidos de entrada
          {waiting.length > 0 && <Badge variant="destructive">{waiting.length}</Badge>}
        </h3>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum convidado aguardando.</p>
        ) : (
          <ul className="relative grid gap-2">
            <>
              {waiting.map((w) => (
                <ListItem key={w.id} className={`${ITEM} flex items-center justify-between gap-3`}>
                  <span className="truncate text-sm font-medium">{w.name}</span>
                  <span className="flex shrink-0 gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => onAnswer(w.id, false)}>
                      Recusar
                    </Button>
                    <Button size="sm" onClick={() => onAnswer(w.id, true)}>
                      Aprovar
                    </Button>
                  </span>
                </ListItem>
              ))}
            </>
          </ul>
        )}
      </section>

      {roomPassword?.enabled && (
        <>
          <Separator className="-mx-4 data-horizontal:w-auto" />
          <PasswordBox info={roomPassword} />
        </>
      )}

      {blockCount > 0 && (
        <>
          <Separator className="-mx-4 data-horizontal:w-auto" />
          <section className="grid gap-3">
            <h3 className={HEADING}>
              Solicitações
              {requestCount > 0 && <Badge variant="destructive">{requestCount}</Badge>}
            </h3>
            {requestCount === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém pediu liberação ainda.</p>
            ) : (
              <ul className="relative grid gap-2">
                <>
                  {requests.map((id) => {
                    const p = byId(id);
                    return (
                      <ListItem key={id} className={`${ITEM} flex flex-wrap items-center justify-between gap-x-3 gap-y-2`}>
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                          <HandIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          <span className="truncate">{p?.name ?? "Participante"} levantou a mão</span>
                        </span>
                        <span className="relative flex shrink-0 flex-wrap gap-1.5">
                          <>
                            {p?.handRaised && (
                              <Pop key="lower">
                                <Button variant="ghost" size="sm" onClick={() => onLowerHand(id)}>
                                  Baixar a mão
                                </Button>
                              </Pop>
                            )}
                          </>
                          <Button
                            size="sm"
                            onClick={() => {
                              setAttending(id);
                              cards.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }}
                          >
                            Atender
                          </Button>
                        </span>
                      </ListItem>
                    );
                  })}
                </>
              </ul>
            )}
          </section>
        </>
      )}

      <Separator className="-mx-4 data-horizontal:w-auto" />

      <section className="grid gap-3">
        <h3 className={HEADING}>Controles globais</h3>
        <div className="grid grid-cols-3 gap-2">
          <ToggleButton icon={<MicOffIcon />} label="Silenciar todos" hint="Desliga o microfone de todos os participantes." onToggle={() => onMuteAll("audio")} />
          <ToggleButton icon={<VideoOffIcon />} label="Parar câmeras" hint="Desliga a câmera de todos os participantes." onToggle={() => onMuteAll("video")} />
          <ToggleButton icon={<ScreenShareOffIcon />} label="Parar telas" hint="Encerra o compartilhamento de tela de todos os participantes." onToggle={() => onMuteAll("screenshare")} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ToggleButton
            icon={<PresentationIcon />}
            label="Modo apresentador"
            hint="Microfones ficam bloqueados e usuários devem levantar a mão para solicitar o direito a fala."
            on={moderated}
            disabled={moderation === null}
            onToggle={() => onToggleModeration(!moderated)}
          />
          <ToggleButton
            icon={<VolumeXIcon />}
            label="Silenciar sons de reação"
            hint="Desliga, para todos, os sons de aplausos, risadas e outras reações."
            on={reactionsMuted === true}
            disabled={reactionsMuted === null}
            onToggle={() => onToggleReactions(reactionsMuted !== true)}
          />
          <ToggleButton
            icon={<CameraOffIcon />}
            label="Bloquear vídeo"
            hint="Ninguém liga a câmera sem a sua liberação. Os pedidos aparecem em Solicitações."
            on={mediaMod?.video.enabled === true}
            disabled={mediaMod === null}
            onToggle={() => onToggleMediaMod("video", mediaMod?.video.enabled !== true)}
          />
          <ToggleButton
            icon={<MonitorOffIcon />}
            label="Bloquear compartilhamento"
            hint="Ninguém compartilha a tela sem a sua liberação. Os pedidos aparecem em Solicitações."
            on={mediaMod?.desktop.enabled === true}
            disabled={mediaMod === null}
            onToggle={() => onToggleMediaMod("desktop", mediaMod?.desktop.enabled !== true)}
          />
          <ToggleButton
            icon={<UsersIcon />}
            label="Todos + gravação me seguem"
            hint="Todos, inclusive a gravação, passam a ver o que você está vendo: o participante em destaque, a grade ou a tela compartilhada. Ligar um desliga o “Só a gravação me segue”."
            on={groupOptions?.followMe === true}
            disabled={groupOptions === null}
            onToggle={() => onFollowMe("everyone", groupOptions?.followMe !== true)}
          />
          <ToggleButton
            icon={<CircleDotIcon />}
            label="Só a gravação me segue"
            hint={media?.recording === true ? "Só a gravação mostra o que você está vendo; os participantes continuam livres. Ligar um desliga o “Todos + gravação me seguem”." : "Disponível quando Permitir gravação estiver ligado em Configurações da sala."}
            on={groupOptions?.followMeRecorder === true}
            disabled={groupOptions === null || media?.recording !== true}
            onToggle={() => onFollowMe("recorder", groupOptions?.followMeRecorder !== true)}
          />
        </div>
      </section>

      {fullAccess && media?.recording === true && (
        <>
          <Separator className="-mx-4 data-horizontal:w-auto" />
          <section className="grid gap-3">
            <h3 className={HEADING}>Controles de mídia</h3>
            <div className="grid grid-cols-2 gap-2">
              <ToggleButton
                icon={mediaStatus?.recording === "on" || mediaStatus?.recording === "pending" ? <SquareIcon /> : <CircleDotIcon />}
                label={mediaStatus?.recording === "on" ? "Parar gravação" : mediaStatus?.recording === "pending" ? "Iniciando…" : "Gravar reunião"}
                hint="Grava a reunião (vídeo e áudio)."
                on={mediaStatus?.recording === "on" || mediaStatus?.recording === "pending"}
                disabled={!mediaStatus || mediaStatus.recording === "pending"}
                onToggle={() => onRecording(mediaStatus?.recording !== "on")}
              />
              <ToggleButton
                icon={<CaptionsIcon />}
                label="Transcrever ao final"
                hint="Quando a gravação terminar, ela é transcrita por IA e o e-mail com a gravação e a transcrição é enviado ao fim. Pode ser ligado ou desligado a qualquer momento."
                on={transcribeAtEnd}
                onToggle={() => onTranscribeAtEnd(!transcribeAtEnd)}
              />
            </div>
            <MediaInfo status={mediaStatus} note={mediaNote} />
          </section>
        </>
      )}

      <Separator className="-mx-4 data-horizontal:w-auto" />

      <section className="grid gap-3">
        <h3 className={HEADING}>
          Participantes
          {participantsAvailable && <Badge variant="secondary">{participants.length}</Badge>}
        </h3>

        {!participantsAvailable ? (
          <p className="text-sm text-muted-foreground">A lista de participantes não está disponível agora.</p>
        ) : participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Só você está na sala.</p>
        ) : (
          <ul className="relative grid gap-2">
            <>
              {participants.map((p) => (
                <ListItem key={p.id} className={ITEM}>
                  <ParticipantCard
                    p={p}
                    audioOn={moderated}
                    videoOn={videoOn}
                    desktopOn={desktopOn}
                    audioOk={p.moderator || moderation?.approved.includes(p.id) === true}
                    videoOk={p.moderator || mediaMod?.video.approved.includes(p.id) === true}
                    desktopOk={p.moderator || mediaMod?.desktop.approved.includes(p.id) === true}
                    attending={attendingId === p.id}
                    register={(el) => {
                      if (el) cards.current.set(p.id, el);
                      else cards.current.delete(p.id);
                    }}
                    onMuteOne={onMuteOne}
                    onBlock={onBlock}
                    onAskToUnmute={onAskToUnmute}
                    onApproveMedia={onApproveMedia}
                    onBlockMedia={onBlockMedia}
                    onDismissRequest={onDismissRequest}
                    onStopOtherShares={onStopOtherShares}
                    onKick={onKick}
                  />
                </ListItem>
              ))}
            </>
          </ul>
        )}
      </section>
    </>
  );
}

/** Cartão de um participante: selos de bloqueio, botões de função (só ícone, abrem ao passar o mouse) e o menu de opções. */
function ParticipantCard({
  p,
  audioOn,
  videoOn,
  desktopOn,
  audioOk,
  videoOk,
  desktopOk,
  attending,
  register,
  onMuteOne,
  onBlock,
  onAskToUnmute,
  onApproveMedia,
  onBlockMedia,
  onDismissRequest,
  onStopOtherShares,
  onKick,
}: {
  p: RoomParticipant;
  /** Bloqueio de microfone (Modo Apresentador), de câmera e de compartilhamento ligados na sala. */
  audioOn: boolean;
  videoOn: boolean;
  desktopOn: boolean;
  /** Liberado para este participante (moderador sempre é). */
  audioOk: boolean;
  videoOk: boolean;
  desktopOk: boolean;
  /** Pedido em atendimento: o botão de opções vira uma mão levantada em destaque. */
  attending: boolean;
  register: (el: HTMLElement | null) => void;
  onMuteOne: Props["onMuteOne"];
  onBlock: (id: string) => void;
  onAskToUnmute: (id: string) => void;
  onApproveMedia: (kind: MediaKind, id: string) => void;
  onBlockMedia: (kind: MediaKind, id: string) => void;
  onDismissRequest: (id: string) => void;
  onStopOtherShares: (id: string) => void;
  onKick: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    // O cartão cresce com o menu aberto: garante que ele apareça inteiro na lista.
    const frame = window.requestAnimationFrame(() => box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  // Observador invisível (nome com 👁): sem controles nem selos, para ninguém o expor ao pedir que ligue.
  const observer = p.name.startsWith("👁");
  const canAudio = audioOn && !audioOk;
  // Cada bloqueio ligado oferece Liberar (cortado) ou Bloquear (liberado) para este participante; moderador não é bloqueado.
  const audioToggle = audioOn && !p.moderator;
  const videoToggle = videoOn && !p.moderator;
  const desktopToggle = desktopOn && !p.moderator;
  const showMenu = !observer && (audioToggle || videoToggle || desktopToggle || p.sharing || attending);
  const pick = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };

  return (
    <div ref={(el) => register(el)} className="scroll-mt-4">
      <div className="flex items-start gap-2">
        <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-2 pt-1">
          <span className="truncate text-sm font-medium">{p.name}</span>
          <>
            {p.moderator && (
              <Pop key="moderador">
                <Badge variant="outline">moderador</Badge>
              </Pop>
            )}
            {p.handRaised && (
              <Pop key="mao">
                <StatusDot label="Mão levantada" className="bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  <HandIcon />
                </StatusDot>
              </Pop>
            )}
            {!observer && audioOn && <LockDot key="a" off={!audioOk} offLabel="Microfone cortado" onLabel="Microfone liberado" offIcon={<MicOffIcon />} onIcon={<MicIcon />} />}
            {!observer && videoOn && <LockDot key="v" off={!videoOk} offLabel="Câmera cortada" onLabel="Câmera liberada" offIcon={<VideoOffIcon />} onIcon={<VideoIcon />} />}
            {!observer && desktopOn && <LockDot key="d" off={!desktopOk} offLabel="Tela cortada" onLabel="Tela liberada" offIcon={<ScreenShareOffIcon />} onIcon={<ScreenShareIcon />} />}
          </>
        </div>
        <RemoveToggle name={p.name} onConfirm={() => onKick(p.id)} />
      </div>

      {!observer && (
        <div ref={box} className="mt-2 grid gap-1.5">
          <div className="relative flex flex-wrap gap-1.5">
            <>
              {p.audioMuted === false ? (
                // Com o Modo Apresentador, silenciar quem foi liberado também revoga a liberação.
                <Chip icon={<MicOffIcon />} label="Silenciar" onClick={() => (audioOn && audioOk && !p.moderator ? onBlock(p.id) : onMuteOne(p.id, "audio"))} />
              ) : (
                !canAudio && <Chip icon={<MicIcon />} label="Pedir para ligar" onClick={() => onAskToUnmute(p.id)} />
              )}
              <Chip icon={<VideoOffIcon />} label={p.videoMuted === false ? "Parar câmera" : "Sem câmera"} disabled={p.videoMuted !== false} onClick={() => onMuteOne(p.id, "video")} />
              {p.sharing && <Chip icon={<ScreenShareOffIcon />} label="Parar tela" onClick={() => onMuteOne(p.id, "screenshare")} />}
              {showMenu && (
                <Chip
                  icon={attending ? <HandIcon /> : <EllipsisIcon />}
                  label={attending ? "Atendendo o pedido" : "Mais opções"}
                  active={attending}
                  onClick={() => setMenu((v) => !v)}
                />
              )}
            </>
          </div>

          {menu && showMenu && (
            <div role="menu" aria-label={`Mais opções de ${p.name}`} className="animate-in fade-in-0 slide-in-from-top-1 grid gap-0.5 rounded-lg bg-background/60 p-1 duration-150">
              <MenuItem icon={<ScreenShareOffIcon />} disabled={!p.sharing} onClick={pick(() => onStopOtherShares(p.id))}>
                Parar todas as telas, menos esta
              </MenuItem>
              <Separator className="my-0.5" />
              <MenuItem
                icon={<MicIcon />}
                disabled={!audioToggle}
                onClick={pick(() => {
                  if (audioOk) onBlock(p.id);
                  else {
                    onAskToUnmute(p.id);
                    onDismissRequest(p.id);
                  }
                })}
              >
                {audioOk && audioToggle ? "Bloquear microfone" : "Liberar microfone"}
              </MenuItem>
              <MenuItem
                icon={<VideoIcon />}
                disabled={!videoToggle}
                onClick={pick(() => {
                  if (videoOk) onBlockMedia("video", p.id);
                  else {
                    onApproveMedia("video", p.id);
                    onDismissRequest(p.id);
                  }
                })}
              >
                {videoOk && videoToggle ? "Bloquear câmera" : "Liberar câmera"}
              </MenuItem>
              <MenuItem
                icon={<ScreenShareIcon />}
                disabled={!desktopToggle}
                onClick={pick(() => {
                  if (desktopOk) onBlockMedia("desktop", p.id);
                  else {
                    onApproveMedia("desktop", p.id);
                    onDismissRequest(p.id);
                  }
                })}
              >
                {desktopOk && desktopToggle ? "Bloquear compartilhamento de tela" : "Liberar compartilhamento de tela"}
              </MenuItem>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, disabled, onClick, children }: { icon: React.ReactNode; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onClick();
      }}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0",
        disabled ? "cursor-not-allowed opacity-45" : "hover:bg-secondary",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ----------------------------- Configurações da sala ----------------------------- */

function RoomTab({ closed, groupOptions, media, onMediaFlags, onToggleClosed, onStartMuted }: Props) {
  const flags = media ?? { recording: false };
  return (
    <>
      <section className="grid gap-3">
        <h3 className={HEADING}>Configurações iniciais</h3>
        <div className="grid gap-2">
          <SwitchRow
            id="start-video-muted"
            title="Todos iniciam ocultos"
            text="Quem entrar depois começa com a câmera desligada, mas pode ligá-la quando quiser."
            checked={groupOptions?.startVideoMuted === true}
            disabled={groupOptions === null}
            onChange={(v) => onStartMuted("video", v)}
          />
          <SwitchRow
            id="start-audio-muted"
            title="Todos iniciam silenciados"
            text="Quem entrar depois começa com o microfone desligado, mas pode ligá-lo quando quiser."
            checked={groupOptions?.startAudioMuted === true}
            disabled={groupOptions === null}
            onChange={(v) => onStartMuted("audio", v)}
          />
        </div>
      </section>

      <Separator className="-mx-4 data-horizontal:w-auto" />

      <section className="grid gap-3">
        <h3 className={HEADING}>Modos da sala</h3>
        <div className="grid gap-2">
          <SwitchRow
            id="meeting-closed"
            title="Reunião fechada"
            text="Qualquer pessoa fora da sala (exceto moderadores) precisará de aprovação para entrar, mesmo estando na lista de acesso."
            checked={closed === true}
            disabled={closed === null}
            onChange={onToggleClosed}
          />
        </div>
      </section>

      <Separator className="-mx-4 data-horizontal:w-auto" />

      <section className="grid gap-3">
        <h3 className={HEADING}>Gravação</h3>
        <SwitchRow
          id="allow-recording"
          title="Permitir gravação"
          text="Libera o botão Gravar reunião nos controles de mídia e o botão Só a gravação me segue."
          checked={flags.recording}
          disabled={media === null}
          onChange={(v) => onMediaFlags({ ...flags, recording: v })}
        />
      </section>
    </>
  );
}

/* ------------------------------------ Perfil ------------------------------------ */

function ProfileTab({
  profile,
  open,
  onSaveName,
  onUploadPhoto,
  onLogout,
}: {
  profile: MenuProfile | null;
  open: boolean;
  onSaveName: Props["onSaveName"];
  onUploadPhoto: Props["onUploadPhoto"];
  onLogout: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<"name" | "photo" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [photoName, setPhotoName] = useState("");
  const loadedName = profile?.name ?? "";

  // O campo acompanha o nome vigente (inclusive quando o painel o troca).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(loadedName);
  }, [loadedName, open]);

  const run = async (kind: "name" | "photo", job: () => Promise<ProfileResult>) => {
    setBusy(kind);
    setMessage(null);
    const r = await job();
    setBusy(null);
    setMessage({ ok: r.ok, text: (r.ok ? r.notice : r.error) ?? (r.ok ? "Feito." : "Não foi possível concluir.") });
  };

  if (!profile) {
    return <p className="text-sm text-muted-foreground">Carregando o seu perfil…</p>;
  }

  return (
    <section className="grid gap-5">
      <h3 className={HEADING}>Perfil</h3>

      <div className="grid gap-3 rounded-xl bg-muted/50 p-3">
        <div className="flex items-center gap-3">
          {profile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.photoUrl} alt="Sua foto" width={64} height={64} className="size-16 rounded-full border object-cover" />
          ) : (
            <span className="grid size-16 place-items-center rounded-full border bg-secondary text-xl font-semibold text-secondary-foreground" aria-hidden="true">
              {profile.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="grid min-w-0 flex-1 gap-1.5">
            <label
              htmlFor="profile-photo"
              aria-disabled={busy !== null}
              className="flex h-10 w-fit min-w-44 max-w-full cursor-pointer items-center justify-center rounded-[10px] border border-input bg-[#f6f9fd] px-4 text-sm font-medium transition-colors has-[:focus-visible]:border-primary aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:bg-white/[0.045]"
            >
              Escolha o arquivo
              <input
                id="profile-photo"
                type="file"
                accept="image/jpeg,image/png,image/tiff,image/webp"
                className="sr-only"
                disabled={busy !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) {
                    setPhotoName(file.name);
                    void run("photo", () => onUploadPhoto(file));
                  }
                }}
              />
            </label>
            <p className="text-xs leading-normal break-all text-muted-foreground">{busy === "photo" ? "Enviando…" : photoName || "Nenhum arquivo escolhido"}</p>
            <p className="text-xs leading-normal text-muted-foreground">JPG, PNG, TIFF ou WebP, até 2 MB.</p>
          </div>
        </div>
      </div>

      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run("name", () => onSaveName(name));
        }}
      >
        <Label htmlFor="profile-name">Nome de exibição</Label>
        <div className="flex gap-2">
          <Input id="profile-name" value={name} maxLength={60} autoComplete="off" onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={busy !== null || name.trim() === "" || name.trim() === profile.name}>
            {busy === "name" ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </form>

      <p className="text-xs leading-normal text-muted-foreground">{profile.status}</p>

      {message && (
        <p role="status" className={cn("rounded-lg border px-3 py-2 text-sm leading-normal", message.ok ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "border-destructive/40 text-destructive")}>
          {message.text}
        </p>
      )}

      <Separator className="-mx-4 data-horizontal:w-auto" />
      <Button type="button" variant="destructive" size="lg" onClick={onLogout}>
        <LogOutIcon /> Encerrar sessão da conta
      </Button>
    </section>
  );
}

/**
 * Botão de remover no estilo "Ring": o X vira uma pílula que se expande para a esquerda e revela
 * "Confirmar remoção". Clicar no X de novo, ou fora, recolhe.
 * Só CSS: a largura anima por grid (0fr -> 1fr) e a opacidade por transição.
 */
function RemoveToggle({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div
      ref={box}
      className={cn(
        "flex shrink-0 items-center overflow-hidden rounded-full transition-colors duration-200 ease-[var(--ease-out-quart)]",
        open ? "bg-destructive/15" : "bg-transparent",
      )}
    >
      <div
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-columns,opacity] ease-[var(--ease-out-quart)] motion-reduce:transition-none",
          open ? "grid-cols-[1fr] opacity-100 duration-[260ms]" : "grid-cols-[0fr] opacity-0 duration-150",
        )}
      >
        <div className="overflow-hidden">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full pr-1 pl-3 whitespace-nowrap text-destructive hover:bg-destructive/20 dark:hover:bg-destructive/20"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Confirmar remoção
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn("rounded-full", open && "text-destructive hover:bg-destructive/20")}
        aria-label={open ? "Cancelar remoção" : `Remover ${name} da sala`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <XIcon
          className={cn(
            "size-[18px] transition-transform duration-200 ease-[var(--ease-out-quart)] motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
      </Button>
    </div>
  );
}
