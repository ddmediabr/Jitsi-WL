/** Vai à página de entrada com navegação completa (o domínio é dividido com o Jitsi; veja README: roteamento por "documento"). */
export function goHome(): void {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/");
}
