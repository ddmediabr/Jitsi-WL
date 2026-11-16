/**
 * Persistência da sessão do cadastrado entre salas (mesmo navegador).
 *
 * A sessão do Jicofo morre quando a conferência acaba, então ela não pode ser reaproveitada. A
 * retomada é feita pelo Prosody: ele liga o cookie do painel (HttpOnly) à conta que se autenticou
 * e, com a INTENÇÃO sinalizada em `/flow-api/pass?intent=resume`, emite uma sessão nova se a conta
 * tiver acesso à sala (mod_ddmedia_focus_authz). Aqui guardamos só um AVISO não secreto (o nome de
 * usuário) para oferecer "continuar como ...". Nenhuma senha é guardada.
 */

const KEY = "dd:member";
const JITSI_SESSION_KEY = "sessionId";
/** Mesmo prazo da tabela de sessões do módulo do Prosody (24 h). */
const MAX_AGE_MS = 24 * 3600 * 1000;

export type SavedMember = { user: string; at: number };

export function readSavedMember(): SavedMember | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedMember>;
    if (typeof data.user !== "string" || !data.user || typeof data.at !== "number") return null;
    if (Date.now() - data.at > MAX_AGE_MS) return null;
    return { user: data.user, at: data.at };
  } catch {
    return null;
  }
}

export function saveMember(user: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ user, at: Date.now() } satisfies SavedMember));
  } catch {
    /* armazenamento indisponível: simplesmente não há persistência */
  }
}

/** Esquece o aviso e qualquer session-id antigo do Jitsi (um velho faz o Jicofo recusar o login). */
export function clearMember(): void {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(JITSI_SESSION_KEY);
  } catch {
    /* ignora */
  }
}

/** Remove só o session-id antigo do Jitsi (não mexe no aviso da retomada). */
export function dropStaleJitsiSession(): void {
  try {
    window.localStorage.removeItem(JITSI_SESSION_KEY);
  } catch {
    /* ignora */
  }
}

/**
 * Prepara os cookies do painel ANTES de abrir o Jitsi.
 * `resume`: este acesso é retomada de sessão. `reset`: troca o segredo do navegador.
 */
export async function prepareCookies(opts: { resume?: boolean; reset?: boolean } = {}): Promise<void> {
  const q = new URLSearchParams();
  if (opts.resume) q.set("intent", "resume");
  if (opts.reset) q.set("reset", "1");
  try {
    await fetch(`/flow-api/pass?${q.toString()}`, { cache: "no-store", credentials: "same-origin" });
  } catch {
    /* sem cookie: segue como acesso comum */
  }
}
