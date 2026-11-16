/**
 * Catálogo dos fundos prontos (presets) das páginas de entrada. Só dados, sem importações: serve ao servidor (validação) e ao navegador.
 * Os arquivos ficam em `public/_flow/presets/` (o prefixo `/_flow` é o que o Traefik entrega a este app).
 * `hue` é o matiz dominante da mídia (graus, HSL), usado para girar a cor até a cor de destaque de cada paleta.
 */
export type PresetMedia = { id: string; label: string; hue: number; file: string; thumb: string };

export const VIDEO_PRESETS: PresetMedia[] = [
  { id: "particulas", label: "Partículas", hue: 212, file: "/_flow/presets/video/particulas.mp4", thumb: "/_flow/presets/video/particulas.jpg" },
  { id: "ondas", label: "Ondas", hue: 183, file: "/_flow/presets/video/ondas.mp4", thumb: "/_flow/presets/video/ondas.jpg" },
  { id: "faiscas", label: "Faíscas", hue: 31, file: "/_flow/presets/video/faiscas.mp4", thumb: "/_flow/presets/video/faiscas.jpg" },
];

export const IMAGE_PRESETS: PresetMedia[] = [
  { id: "degrade", label: "Degradê", hue: 306, file: "/_flow/presets/image/degrade.webp", thumb: "/_flow/presets/image/degrade-thumb.webp" },
  { id: "nevoa", label: "Névoa", hue: 231, file: "/_flow/presets/image/nevoa.webp", thumb: "/_flow/presets/image/nevoa-thumb.webp" },
  { id: "seda", label: "Seda", hue: 210, file: "/_flow/presets/image/seda.webp", thumb: "/_flow/presets/image/seda-thumb.webp" },
];

export const findVideoPreset = (id: unknown) => VIDEO_PRESETS.find((p) => p.id === id);
export const findImagePreset = (id: unknown) => IMAGE_PRESETS.find((p) => p.id === id);
