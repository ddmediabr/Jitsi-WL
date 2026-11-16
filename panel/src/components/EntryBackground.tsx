"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { useBrand } from "@/components/BrandProvider";
import { brandUrl } from "@/lib/brand";
import { findImagePreset, findVideoPreset } from "@/lib/entry-preset-list";
import { bgVars, filterCss, type EntryBg, type Theme } from "@/lib/entry-bg";
import { cn } from "@/lib/utils";

/**
 * Desenho do fundo (vídeo em laço ou imagem) com os filtros CSS de cada tema. Os filtros, o modo de mistura e a opacidade ficam no
 * CONTÊINER (não na mídia): assim a mistura (`mix-blend-mode`) acontece com o fundo da página e o vídeo "some" no fundo do tema.
 * Só CSS: sem blur. Quem pede "reduzir movimento" no sistema vê o vídeo PARADO no primeiro quadro (em vez de sumir); o vídeo não tem áudio nem controles.
 */
export function EntryBackgroundView({
  bg,
  videoVersion,
  imageVersion,
  contained = false,
  theme,
  className,
}: {
  bg: EntryBg;
  videoVersion: number | null;
  imageVersion: number | null;
  /** true: preenche o elemento pai (prévia no painel) em vez da janela inteira. */
  contained?: boolean;
  /** Força os filtros de um tema (prévia no painel); sem isso, vale o tema da página. */
  theme?: Theme;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoPreset = findVideoPreset(bg.videoPreset);
  const imagePreset = findImagePreset(bg.imagePreset);
  const showVideo = bg.mode === "video" && (videoPreset !== undefined || videoVersion !== null);
  const showImage = bg.mode === "image" && (imagePreset !== undefined || imageVersion !== null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (bg.respectMotion && reduce.matches) v.pause();
      else void v.play().catch(() => undefined);
    };
    apply();
    reduce.addEventListener("change", apply);
    return () => reduce.removeEventListener("change", apply);
  }, [showVideo, videoVersion, videoPreset?.id, bg.respectMotion]);
  if (!showVideo && !showImage) return null;
  const forced = theme ? bg[theme] : null;
  const style = (forced
    ? { filter: filterCss(forced), mixBlendMode: forced.blend, opacity: forced.opacity / 100 }
    : bgVars(bg)) as CSSProperties;
  const mediaStyle: CSSProperties | undefined = forced ? { objectPosition: `${forced.posX}% 50%` } : undefined;
  return (
    <div aria-hidden="true" className={cn("entry-bg", contained && "entry-bg-contained", className)} style={style}>
      {showVideo ? (
        <video
          key={videoPreset?.id ?? "upload"}
          ref={videoRef}
          src={videoPreset ? videoPreset.file : brandUrl("entry_video", videoVersion as number)}
          muted
          loop
          autoPlay
          playsInline
          disablePictureInPicture
          preload="auto"
          tabIndex={-1}
          style={mediaStyle}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imagePreset ? imagePreset.file : brandUrl("entry_image", imageVersion as number)} alt="" decoding="async" style={mediaStyle} />
      )}
    </div>
  );
}

/** Fundo das páginas de entrada, vindo da identidade configurada em Personalização. */
export default function EntryBackground() {
  const brand = useBrand();
  return <EntryBackgroundView bg={brand.entryBg} videoVersion={brand.entryVideoVersion} imageVersion={brand.entryImageVersion} />;
}
