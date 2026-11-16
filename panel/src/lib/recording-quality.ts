/**
 * Qualidade da gravação (resolução do vídeo) e o limite estimado de gravações simultâneas de cada uma.
 * Módulo puro (servidor e navegador). Os limites são ESTIMATIVAS, não medições com carga real:
 *  - base medida: uma gravação de 720p com 1 participante usou ~0,8 núcleo do servidor (ffmpeg ~35% + 2 processos do Chrome);
 *  - reuniões reais (vários vídeos + compartilhamento) pesam mais, então a estimativa usa ~1,2 núcleo para 720p;
 *  - o custo cresce com o número de pixels (900p ≈ 1,6x; 1080p ≈ 2,25x);
 *  - "compartilhado" = o Jibri divide as 4 CPUs com o Jitsi e o painel; "dedicado" = servidor só do Jibri.
 */
export type RecordingQuality = "480p" | "720p" | "900p" | "1080p";

export const QUALITY_ORDER: RecordingQuality[] = ["480p", "720p", "900p", "1080p"];
export const DEFAULT_QUALITY: RecordingQuality = "900p";

export type QualityInfo = {
  label: string;
  /** Resolução "LxA" (o formato do Jibri). */
  resolution: string;
  /** Núcleos de CPU por gravação (estimativa). */
  cores: number;
  /** Gravações simultâneas estimadas com o Jibri dividindo o servidor com o Jitsi (4 CPUs, ~1,5 núcleo ocupado por reuniões). */
  shared: number;
  /** Gravações simultâneas estimadas em servidor dedicado ao Jibri (4 CPUs livres). */
  dedicated: number;
  /** 1080p só é permitido em servidor dedicado. */
  needsDedicated: boolean;
};

export const QUALITIES: Record<RecordingQuality, QualityInfo> = {
  "480p": { label: "480p (854×480)", resolution: "854x480", cores: 0.6, shared: 4, dedicated: 6, needsDedicated: false },
  "720p": { label: "720p (1280×720)", resolution: "1280x720", cores: 1.2, shared: 2, dedicated: 3, needsDedicated: false },
  "900p": { label: "900p (1600×900)", resolution: "1600x900", cores: 1.9, shared: 1, dedicated: 2, needsDedicated: false },
  "1080p": { label: "1080p (1920×1080)", resolution: "1920x1080", cores: 2.7, shared: 0, dedicated: 1, needsDedicated: true },
};

export function isQuality(v: unknown): v is RecordingQuality {
  return typeof v === "string" && (QUALITY_ORDER as string[]).includes(v);
}

/** Limite estimado de gravações simultâneas para a qualidade e o tipo de servidor. */
export function maxConcurrent(q: RecordingQuality, dedicated: boolean): number {
  return dedicated ? QUALITIES[q].dedicated : QUALITIES[q].shared;
}

/** A qualidade escolhida vale? (1080p exige servidor dedicado.) Senão, cai para a maior permitida. */
export function effectiveQuality(q: RecordingQuality, dedicated: boolean): RecordingQuality {
  return QUALITIES[q].needsDedicated && !dedicated ? "900p" : q;
}
