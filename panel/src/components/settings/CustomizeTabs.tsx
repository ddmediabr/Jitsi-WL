import Link from "next/link";

/** Abas de Personalização. O `id` vai na URL (?aba=...), então cada aba tem endereço próprio e o servidor desenha só a aba aberta. */
export const CUSTOMIZE_TABS = [
  { id: "geral", label: "Geral" },
  { id: "espera", label: "Sala de espera" },
  { id: "entrada", label: "Página de entrada" },
  { id: "saida", label: "Páginas de saída" },
  { id: "emails", label: "E-mails" },
] as const;

export type CustomizeTab = (typeof CUSTOMIZE_TABS)[number]["id"];

export function parseTab(value: string | undefined): CustomizeTab {
  return CUSTOMIZE_TABS.find((t) => t.id === value)?.id ?? "geral";
}

/** Barra de abas (links): a aba atual leva `aria-current="page"`. Rola na horizontal em telas estreitas. */
export default function CustomizeTabs({ current }: { current: CustomizeTab }) {
  return (
    <nav aria-label="Seções de Personalização" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-1 rounded-xl border bg-card p-1">
        {CUSTOMIZE_TABS.map((t) => (
          <li key={t.id}>
            <Link
              href={t.id === "geral" ? "/settings/customize" : `/settings/customize?aba=${t.id}`}
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
