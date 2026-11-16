/** Fuso horário do painel: padrão e utilidades puras (valem no servidor e no navegador). */
export const DEFAULT_TZ = "America/Sao_Paulo";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
    return tz.length > 0 && tz.length < 64;
  } catch {
    return false;
  }
}

/** Formatador pt-BR no fuso dado. */
export function dateFormatter(tz: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" }): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("pt-BR", { ...opts, timeZone: isValidTimeZone(tz) ? tz : DEFAULT_TZ });
}

function wallParts(at: Date, tz: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(at)
      .map((x) => [x.type, Number(x.value)]),
  );
}

/** Diferença (ms) entre o horário local do fuso e UTC naquele instante. */
function offsetMs(at: Date, tz: string): number {
  const p = wallParts(at, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000;
}

/** "AAAA-MM-DD" no fuso -> instante do começo (ou do fim) desse dia. Inválido = null. */
export function zonedDayBoundary(value: string | undefined, end: boolean, tz: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const zone = isValidTimeZone(tz) ? tz : DEFAULT_TZ;
  const wall = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(wall.getTime())) return null;
  let t = wall.getTime() - offsetMs(wall, zone);
  t = wall.getTime() - offsetMs(new Date(t), zone); // 2ª passada: virada de horário de verão
  return new Date(t);
}

/** Milissegundos até a próxima ocorrência de `hour`:00 no fuso. */
export function msUntilLocalHour(hour: number, tz: string, now = new Date()): number {
  const zone = isValidTimeZone(tz) ? tz : DEFAULT_TZ;
  const p = wallParts(now, zone);
  const since = ((p.hour * 60 + p.minute) * 60 + p.second) * 1000;
  const day = 24 * 3600_000;
  return (hour * 3600_000 - since + day) % day || day;
}
