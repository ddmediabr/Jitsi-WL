/**
 * Salas em que a pessoa entrou há pouco, guardadas só neste navegador (localStorage). Servem à página de saída:
 * "voltar à sala" e a lista de salas recentes. Nada disso vai para o servidor. Qualquer falha de armazenamento é ignorada.
 */
const KEY = "dd-recent-rooms";
const MAX = 6;

export function readRecentRooms(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Põe a sala no topo da lista (sem repetir). */
export function rememberRoom(room: string): void {
  try {
    const next = [room, ...readRecentRooms().filter((r) => r !== room)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* armazenamento indisponível: a lista só não aparece */
  }
}
