const GB = 1024 ** 3;

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: n < 10 ? 1 : 0 });

/**
 * Mostrador de espaço das gravações: a barra inteira é o teto definido nas configurações;
 * a linha marca onde a limpeza começa (5 GB antes) e o trecho final, a margem de segurança, é vermelho.
 */
export default function RecordingGauge({ usedBytes, capGb, cleanupGb }: { usedBytes: number; capGb: number; cleanupGb: number }) {
  const usedGb = usedBytes / GB;
  const pct = (gb: number) => Math.min(100, Math.max(0, (gb / capGb) * 100));
  const cutPct = pct(cleanupGb);
  const usedPct = pct(usedGb);
  const inReserve = usedGb > cleanupGb;
  return (
    <div className="grid gap-2 px-4 pb-4 group-data-[collapsible=icon]:hidden">
      <div className="flex items-baseline justify-between gap-2 text-xs leading-normal">
        <span className="font-medium text-sidebar-foreground">Espaço de gravação</span>
        <span className={inReserve ? "font-semibold text-destructive" : "text-muted-foreground"}>
          {Math.round((usedGb / capGb) * 100)}%
        </span>
      </div>
      <div
        role="meter"
        aria-label="Espaço usado pelas gravações"
        aria-valuemin={0}
        aria-valuemax={capGb}
        aria-valuenow={Math.min(capGb, Math.round(usedGb * 10) / 10)}
        aria-valuetext={`${fmt(usedGb)} GB de ${capGb} GB; a limpeza começa em ${cleanupGb} GB`}
        className="relative h-2.5 overflow-hidden rounded-full bg-muted"
      >
        {/* margem de 5 GB: trecho final em vermelho suave */}
        <div className="absolute inset-y-0 right-0 bg-destructive/25" style={{ left: `${cutPct}%` }} />
        {/* uso: normal até a linha de corte, vermelho depois */}
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.min(usedPct, cutPct)}%` }} />
        {inReserve ? <div className="absolute inset-y-0 bg-destructive" style={{ left: `${cutPct}%`, width: `${usedPct - cutPct}%` }} /> : null}
        {/* linha de corte */}
        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground/70" style={{ left: `${cutPct}%` }} />
      </div>
      <p className="text-right text-[11px] leading-normal text-muted-foreground">
        {usedGb < 0.05 ? "0" : fmt(usedGb)} / {capGb} GB
      </p>
    </div>
  );
}
