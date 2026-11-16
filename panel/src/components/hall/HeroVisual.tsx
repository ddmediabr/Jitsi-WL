/** Ilustração decorativa de uma videoconferência com compartilhamento de tela. Só CSS e tokens do tema: acompanha a paleta e o tema. */
export default function HeroVisual() {
  return (
    <div className="relative grid h-[300px] place-items-center [perspective:1100px] sm:h-[350px]" role="img" aria-label="Ilustração de videoconferência e compartilhamento de tela">
      <div className="absolute size-[85%] rounded-full bg-[radial-gradient(ellipse,color-mix(in_oklch,var(--primary)_22%,transparent),transparent_70%)]" aria-hidden="true" />
      <div
        className="relative z-10 w-[min(570px,100%)] rounded-2xl border bg-card p-3 shadow-[0_28px_80px_rgb(0_0_0/0.35)] [transform:rotateY(-7deg)_rotateX(2deg)] motion-reduce:[transform:none]"
        aria-hidden="true"
      >
        <div className="flex min-h-6 items-center gap-3 text-[8px] font-bold tracking-[0.13em] text-muted-foreground">
          <span className="flex gap-1">
            <i className="size-1.5 rounded-full bg-primary" />
            <i className="size-1.5 rounded-full bg-foreground/25" />
            <i className="size-1.5 rounded-full bg-foreground/25" />
          </span>
          <span>REUNIÃO</span>
          <span className="ml-auto flex items-center gap-1.5 text-[7px]">
            <i className="size-[5px] rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" /> AO VIVO
          </span>
        </div>

        <div className="mt-2 grid grid-cols-[1.05fr_.95fr] gap-2">
          <div className="grid min-h-[200px] grid-cols-2 grid-rows-2 gap-1.5 max-sm:min-h-[150px]">
            {["MC", "RA", "JS"].map((initials, i) => (
              <div key={initials} className={`relative grid min-h-20 place-items-center overflow-hidden rounded-lg border bg-secondary max-sm:min-h-14 ${i === 2 ? "col-span-2" : ""}`}>
                <span className="grid size-10 place-items-center rounded-full border border-primary/45 bg-background/50 text-xs font-bold tracking-wider text-primary">{initials}</span>
              </div>
            ))}
          </div>

          <div className="min-w-0 rounded-lg border bg-secondary p-2">
            <div className="flex items-center gap-1.5 text-[7px] whitespace-nowrap text-muted-foreground">
              <span className="size-1.5 rounded-sm bg-primary" /> Compartilhamento de tela
            </div>
            <div className="mt-2 h-[170px] rounded bg-background p-2.5 max-sm:h-28">
              <div className="mb-2 h-1.5 w-3/5 rounded bg-foreground/30" />
              <div className="flex gap-1">
                {[0, 1, 2].map((k) => (
                  <i key={k} className="h-6 flex-1 rounded-sm border bg-card max-sm:h-4" />
                ))}
              </div>
              <div className="mt-2 flex h-[72px] items-end gap-1.5 rounded-sm bg-card px-2.5 pt-2 max-sm:h-10">
                {[35, 62, 48, 82, 65, 95].map((h, k) => (
                  <i key={k} className="flex-1 rounded-t-sm bg-primary/80" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex h-8 items-end justify-center gap-2">
          <i className="size-5 rounded-full bg-foreground/15" />
          <i className="size-5 rounded-full bg-foreground/15" />
          <i className="size-5 rounded-full bg-primary/30" />
          <i className="h-5 w-6 rounded-full bg-destructive" />
        </div>
      </div>
    </div>
  );
}
