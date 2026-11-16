/**
 * Textos da página de saída da reunião (editáveis em Personalização > Páginas de saída). Módulo puro: servidor (validação) e navegador (tela).
 * Três casos: a pessoa saiu ou foi desconectada; foi removida por um moderador; a reunião foi encerrada para todos.
 */
export const EXIT_TITLE_MAX = 60;
export const EXIT_TEXT_MAX = 150;

export type ExitTexts = { leftTitle: string; leftText: string; kickedTitle: string; kickedText: string; endedTitle: string; endedText: string };

export const EXIT_DEFAULTS: ExitTexts = {
  leftTitle: "Você saiu da reunião ou foi desconectado.",
  leftText: "Não se preocupe, você ainda pode retornar à sala se quiser:",
  kickedTitle: "Você foi removido da sala!",
  kickedText: "Isso pode ter sido inevitável. Você pode tentar solicitar permissão para entrar novamente ou falar com o representante da sala.",
  endedTitle: "Essa reunião chegou ao fim!",
  endedText: "Agradecemos a sua participação, até breve.",
};
