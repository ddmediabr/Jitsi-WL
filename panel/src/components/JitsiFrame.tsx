"use client";

import { useEffect, useRef, useState } from "react";
import { jitsiDomain, loadExternalApi, type JitsiApi } from "@/lib/jitsi";

export type JitsiDevices = {
  audioInput?: string;
  audioOutput?: string;
  videoInput?: string;
};

type Props = {
  room: string;
  displayName?: string;
  config?: Record<string, unknown>;
  interfaceConfig?: Record<string, unknown>;
  /** Rótulos (não IDs) dos aparelhos escolhidos. */
  devices?: JitsiDevices;
  /** Eventos da IFrame API que o componente deve repassar. */
  events?: string[];
  onReady?: (api: JitsiApi) => void;
  onEvent?: (event: string, payload: unknown) => void;
};

/**
 * Cria UMA instância do Jitsi para a sala. Props são lidas só na criação:
 * para trocar de sala/papel, remonte o componente (key).
 */
export default function JitsiFrame(props: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const initial = useRef(props);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const {
      room,
      displayName,
      config,
      interfaceConfig,
      devices,
      events,
      onReady,
      onEvent,
    } = initial.current;
    const parent = holder.current;
    if (!parent) return;

    let api: JitsiApi | null = null;
    let cancelled = false;
    const domain = jitsiDomain();

    loadExternalApi(domain)
      .then((JitsiMeetExternalAPI) => {
        if (cancelled) return;
        api = new JitsiMeetExternalAPI(domain, {
          roomName: room,
          parentNode: parent,
          width: "100%",
          height: "100%",
          userInfo: displayName ? { displayName } : undefined,
          configOverwrite: config,
          interfaceConfigOverwrite: interfaceConfig,
          devices,
        });
        for (const event of events ?? []) {
          api.addListener(event, (payload) => onEvent?.(event, payload));
        }
        onReady?.(api);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
      api?.dispose();
    };
  }, []);

  return (
    <div ref={holder} className="h-full w-full">
      {error && (
        <p role="alert" className="p-6 text-sm text-red-600 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
