"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CameraOffIcon,
  CircleAlertIcon,
  MicIcon,
  MicOffIcon,
  VideoIcon,
  VideoOffIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cleanDisplayName } from "@/lib/jitsi";
import type { JitsiDevices } from "@/components/JitsiFrame";

export type PrejoinResult = {
  name: string;
  audioMuted: boolean;
  videoMuted: boolean;
  devices: JitsiDevices;
  /** Convidado: senha da sala digitada (entra direto se estiver vigente). */
  password?: string;
  /** Moderador: entrar invisível (só observa: sem aparecer, câmera, microfone, chat nem moderação). */
  invisible?: boolean;
};

type Props = {
  room: string;
  onSubmit: (result: PrejoinResult) => void;
  onCancel: () => void;
  /** Texto do botão principal (convidado: "Solicitar entrada"; cadastrado: "Entrar na sala"). */
  submitLabel?: string;
  initialName?: string;
  /** Cadastrado: o nome vem da conta e só muda no menu Perfil, dentro da sala. */
  nameLocked?: boolean;
  /** A sala tem "Sala com senha" ligada: oferece a opção "Tenho a senha da sala" (só convidado). */
  passwordEnabled?: boolean;
  /** A conta pode entrar invisível NESTA sala (moderador real com o Modo invisível liberado). */
  invisibleAvailable?: boolean;
  /** Erro devolvido pela tela que usa o formulário (ex.: senha errada). */
  submitError?: string | null;
  /** Enviando (ex.: conferindo a senha): trava o botão. */
  busy?: boolean;
};

type Lists = {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
};

function describeError(e: unknown): string {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "O navegador bloqueou o acesso. Libere câmera e microfone no cadeado da barra de endereço, ou entre sem eles.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "Nenhum aparelho encontrado. Você pode entrar sem câmera ou microfone.";
  }
  if (name === "NotReadableError") {
    return "A câmera está em uso por outro programa. Feche-o ou escolha outra.";
  }
  return "Não foi possível acessar câmera e microfone.";
}

/** Tela própria de preparação: nome, prévia da câmera, microfone e aparelhos. */
export default function PrejoinForm({
  room,
  onSubmit,
  onCancel,
  submitLabel = "Solicitar entrada",
  initialName = "",
  nameLocked = false,
  passwordEnabled = false,
  invisibleAvailable = false,
  submitError = null,
  busy = false,
}: Props) {
  const [usePassword, setUsePassword] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [invisible, setInvisible] = useState(false);
  const [name, setName] = useState(initialName);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [lists, setLists] = useState<Lists>({ cameras: [], mics: [], speakers: [] });
  const [camId, setCamId] = useState("");
  const [micId, setMicId] = useState("");
  const [spkId, setSpkId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopPreview = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const refreshLists = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const next: Lists = {
        cameras: all.filter((d) => d.kind === "videoinput"),
        mics: all.filter((d) => d.kind === "audioinput"),
        speakers: all.filter((d) => d.kind === "audiooutput"),
      };
      setLists(next);
      setCamId((cur) => cur || next.cameras[0]?.deviceId || "");
      setMicId((cur) => cur || next.mics[0]?.deviceId || "");
      setSpkId((cur) => cur || next.speakers[0]?.deviceId || "");
    } catch {
      /* lista vazia: segue sem aparelhos */
    }
  }, []);

  // Permissão de microfone (só para o navegador liberar os nomes dos aparelhos).
  // A captura é encerrada na hora: o microfone não fica aberto nesta tela.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
      } catch (e) {
        if (alive) setError(describeError(e));
      }
      if (alive) await refreshLists();
    })();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshLists);
    return () => {
      alive = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshLists);
    };
  }, [refreshLists]);

  // Prévia da câmera. Desligar a câmera encerra a captura (a luz apaga).
  useEffect(() => {
    let alive = true;
    stopPreview();
    if (!cameraOn) return;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: camId ? { deviceId: { exact: camId } } : true,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setError(null);
        await refreshLists();
      } catch (e) {
        if (alive) setError(describeError(e));
      }
    })();
    return () => {
      alive = false;
      stopPreview();
    };
  }, [cameraOn, invisible, camId, stopPreview, refreshLists]);

  const label = (list: MediaDeviceInfo[], id: string) =>
    list.find((d) => d.deviceId === id)?.label || undefined;

  const withPassword = passwordEnabled && usePassword;
  // Invisível = sem câmera e sem microfone (não há como aparecer ou falar).
  const mic = micOn && !invisible;
  const camera = cameraOn && !invisible;
  const canSubmit = cleanDisplayName(name).length > 0 && !busy && (!withPassword || roomPassword.trim().length > 0);

  return (
    <form
      // minmax(0,1fr): sem isso, nomes longos de aparelhos alargam a grade e estouram o cartão.
      className="grid grid-cols-[minmax(0,1fr)] gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        // Libera a câmera ANTES de o Jitsi pedi-la, para não disputar o aparelho.
        stopPreview();
        onSubmit({
          name: cleanDisplayName(name),
          audioMuted: !mic,
          videoMuted: !camera,
          ...(withPassword ? { password: roomPassword.trim() } : {}),
          ...(invisibleAvailable && invisible ? { invisible: true } : {}),
          devices: {
            videoInput: camera ? label(lists.cameras, camId) : undefined,
            audioInput: label(lists.mics, micId),
            audioOutput: label(lists.speakers, spkId),
          },
        });
      }}
    >
      <div className="text-center">
        <p className="text-xs tracking-widest text-muted-foreground uppercase">Sala</p>
        <h1 className="mt-1 text-xl font-semibold">{room}</h1>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={nameLocked ? undefined : "display-name"}>Nome de exibição</Label>
        <Input
          id="display-name"
          value={name}
          maxLength={60}
          autoFocus={!nameLocked}
          autoComplete="off"
          readOnly={nameLocked}
          aria-readonly={nameLocked}
          aria-label={nameLocked ? "Nome de exibição" : undefined}
          onChange={(e) => setName(e.target.value)}
          placeholder="Como quer ser chamado"
          // Travado: não recebe foco nem pelo clique nem pelo teclado (sem cursor de texto), mas continua legível.
          tabIndex={nameLocked ? -1 : undefined}
          className={nameLocked ? "pointer-events-none bg-muted/50 text-muted-foreground select-none" : undefined}
        />
        {nameLocked && (
          <p className="text-xs leading-normal text-muted-foreground">O nome da sua conta só pode ser trocado no menu Perfil, dentro da sala.</p>
        )}
      </div>

      <div className="mx-auto aspect-4/3 w-44 overflow-hidden rounded-xl bg-black ring-1 ring-foreground/10">
        {camera ? (
          <video
            ref={videoRef}
            className="h-full w-full -scale-x-100 object-cover"
            autoPlay
            muted
            playsInline
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <CameraOffIcon className="size-5" />
            Câmera desligada
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4">
        <Button
          type="button"
          size="icon-lg"
          variant={mic ? "secondary" : "destructive"}
          className="size-12 rounded-full"
          aria-pressed={mic}
          disabled={invisible}
          aria-label={mic ? "Microfone ligado. Clique para desligar" : "Microfone desligado. Clique para ligar"}
          title={invisible ? "Invisível: sem microfone" : mic ? "Microfone ligado" : "Microfone desligado"}
          onClick={() => setMicOn((v) => !v)}
        >
          {mic ? <MicIcon className="size-5" /> : <MicOffIcon className="size-5" />}
        </Button>
        <Button
          type="button"
          size="icon-lg"
          variant={camera ? "secondary" : "destructive"}
          className="size-12 rounded-full"
          aria-pressed={camera}
          disabled={invisible}
          aria-label={camera ? "Câmera ligada. Clique para desligar" : "Câmera desligada. Clique para ligar"}
          title={invisible ? "Invisível: sem câmera" : camera ? "Câmera ligada" : "Câmera desligada"}
          onClick={() => setCameraOn((v) => !v)}
        >
          {camera ? <VideoIcon className="size-5" /> : <VideoOffIcon className="size-5" />}
        </Button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <DeviceSelect label="Câmera" list={lists.cameras} value={camId} onChange={setCamId} />
        <DeviceSelect label="Microfone" list={lists.mics} value={micId} onChange={setMicId} />
        {lists.speakers.length > 0 && (
          <DeviceSelect
            label="Saída de áudio"
            list={lists.speakers}
            value={spkId}
            onChange={setSpkId}
          />
        )}
      </div>

      {invisibleAvailable && (
        <div className="grid gap-1.5 rounded-xl bg-muted/50 p-3">
          <label className="flex items-center justify-between gap-3 text-sm font-medium" htmlFor="enter-invisible">
            Entrar invisível
            <Switch id="enter-invisible" checked={invisible} onCheckedChange={setInvisible} />
          </label>
          <p className="text-xs leading-normal text-muted-foreground">
            Você vira um observador oculto, sem câmera, microfone, chat e comandos de moderação. Moderadores na sala ainda poderão vê-lo.
          </p>
        </div>
      )}

      {passwordEnabled && (
        <div className="grid gap-2 rounded-xl bg-muted/50 p-3">
          <label className="flex items-center gap-2 text-sm font-medium" htmlFor="use-room-password">
            <input id="use-room-password" type="checkbox" checked={usePassword} onChange={(e) => setUsePassword(e.target.checked)} />
            Tenho a senha da sala
          </label>
          {usePassword && (
            <div className="grid gap-1.5">
              <Label htmlFor="room-password">Senha da sala</Label>
              <Input
                id="room-password"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                maxLength={40}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono tracking-widest uppercase"
                placeholder="Peça a senha atual a um moderador"
              />
              <p className="text-xs leading-normal text-muted-foreground">A senha muda a cada 10 minutos. Com ela você entra direto, sem esperar aprovação.</p>
            </div>
          )}
        </div>
      )}

      {(error || submitError) && (
        <Alert variant="destructive" role="alert">
          <CircleAlertIcon />
          <AlertDescription>{submitError ?? error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2">
        <Button type="submit" size="lg" disabled={!canSubmit}>
          {busy ? "Conferindo…" : withPassword ? "Entrar com a senha" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function DeviceSelect({
  label,
  list,
  value,
  onChange,
}: {
  label: string;
  list: MediaDeviceInfo[];
  value: string;
  onChange: (v: string) => void;
}) {
  const items = list.map((d, i) => ({
    value: d.deviceId,
    label: d.label || `${label} ${i + 1}`,
  }));
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label>{label}</Label>
      <Select
        items={items}
        value={value || null}
        disabled={list.length === 0}
        onValueChange={(v) => onChange(v ?? "")}
      >
        <SelectTrigger className="w-full min-w-0 overflow-hidden">
          <SelectValue
            className="block min-w-0 flex-1 truncate"
            placeholder={list.length === 0 ? "Nenhum encontrado" : "Selecione"}
          />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value || item.label} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
