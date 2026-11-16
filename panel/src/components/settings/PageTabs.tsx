import Link from "next/link";

export type TabDef = { id: string; label: string };

/** Abas de página (links, ?aba=id). A primeira aba é a padrão e não leva parâmetro. */
export function currentTab(tabs: readonly TabDef[], value: string | undefined): string {
  return tabs.find((t) => t.id === value)?.id ?? tabs[0].id;
}

export default function PageTabs({ tabs, current, basePath, label }: { tabs: readonly TabDef[]; current: string; basePath: string; label: string }) {
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-1 rounded-xl border bg-card p-1">
        {tabs.map((t, i) => (
          <li key={t.id}>
            <Link
              href={i === 0 ? basePath : `${basePath}?aba=${t.id}`}
              aria-current={t.id === current ? "page" : undefined}
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
