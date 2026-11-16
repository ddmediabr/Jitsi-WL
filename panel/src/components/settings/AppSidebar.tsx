"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheckIcon, FilmIcon, LayoutDashboardIcon, LogOutIcon, PaletteIcon, SlidersVerticalIcon, UsersIcon, VideoIcon, type LucideIcon } from "lucide-react";
import { useBrand } from "@/components/BrandProvider";
import { brandUrl, isSquareLogo, type Brand } from "@/lib/brand";
import ThemeToggle from "@/components/ThemeToggle";
import RecordingGauge from "@/components/settings/RecordingGauge";
import UserMenu from "@/components/settings/UserMenu";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { logoutAction } from "@/server/auth/actions";

type Item = { href: string; label: string; icon: LucideIcon; badge?: number };

/** Ativo no próprio endereço; "Visão geral" só na raiz (as demais telas são filhas de /settings). */
function isActive(pathname: string, href: string) {
  return href === "/settings" ? pathname === "/settings" : pathname === href || pathname.startsWith(`${href}/`);
}

const ITEM_CLASS =
  "h-11 gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground data-active:font-semibold group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:[&>span:last-child]:hidden [&_svg]:size-[18px]";

const PRODUCT = "Meet Panel";

/**
 * Marca no topo da barra (logo de 64 px de altura). Logo quadrado: logo ao lado do nome da marca e, embaixo dele, "Meet Panel".
 * Logo retangular: só o logo, com "Meet Panel" embaixo (o nome da marca não aparece). Sem logo: o nome e "Meet Panel".
 * Cada tema tem o seu logo (e a sua proporção), então os dois são desenhados e a troca é por CSS.
 */
function SidebarBrand({ brand }: { brand: Brand }) {
  const variants = [
    { theme: "dark", version: brand.logoDarkVersion ?? brand.logoLightVersion, kind: brand.logoDarkVersion !== null ? "logo_dark" : "logo_light", ratio: brand.logoDarkVersion !== null ? brand.logoDarkRatio : brand.logoLightRatio },
    { theme: "light", version: brand.logoLightVersion ?? brand.logoDarkVersion, kind: brand.logoLightVersion !== null ? "logo_light" : "logo_dark", ratio: brand.logoLightVersion !== null ? brand.logoLightRatio : brand.logoDarkRatio },
  ] as const;
  if (variants[0].version === null) {
    return (
      <div className="grid min-w-0 gap-0.5 group-data-[collapsible=icon]:hidden">
        <span className="truncate font-heading text-[17px] leading-tight font-bold text-foreground">{brand.name || "Painel"}</span>
        <span className="truncate text-xs leading-normal text-muted-foreground">{PRODUCT}</span>
      </div>
    );
  }
  return (
    <>
      {variants.map((v) => {
        const square = isSquareLogo(v.ratio);
        return (
          <div key={v.theme} className={v.theme === "dark" ? "hidden min-w-0 dark:block" : "block min-w-0 dark:hidden"}>
            <div className={square ? "flex min-w-0 items-center gap-3" : "grid min-w-0 gap-1.5"}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={brandUrl(v.kind, v.version as number)}
                alt={brand.name}
                className={square ? "size-14 shrink-0 object-contain group-data-[collapsible=icon]:size-8" : "h-14 max-w-full object-contain object-left group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:object-cover"}
              />
              {square ? (
                <div className="grid min-w-0 gap-0.5 group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-heading text-[17px] leading-tight font-bold text-foreground">{brand.name}</span>
                  <span className="truncate text-xs leading-normal text-muted-foreground">{PRODUCT}</span>
                </div>
              ) : (
                <span className="truncate text-xs leading-normal text-muted-foreground group-data-[collapsible=icon]:hidden">{PRODUCT}</span>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Barra lateral do painel (DESIGN.md, seção 3): marca, navegação em grupos e, no rodapé, usuário, tema e Sair. */
export default function AppSidebar({ username, isOwner, roomCount, recUsedBytes, recCapGb, recCleanupGb }: { username: string; isOwner: boolean; roomCount: number; recUsedBytes: number; recCapGb: number; recCleanupGb: number }) {
  const pathname = usePathname();
  const brand = useBrand();
  const groups: { label: string; items: Item[] }[] = [
    {
      label: "Painel",
      items: [
        { href: "/settings", label: "Visão geral", icon: LayoutDashboardIcon },
        { href: "/settings/rooms", label: "Salas", icon: VideoIcon, badge: roomCount },
        { href: "/settings/users", label: "Contas", icon: UsersIcon },
        { href: "/settings/gravacoes", label: "Gravações", icon: FilmIcon },
      ],
    },
    {
      label: "Sistema",
      items: [
        { href: "/settings/customize", label: "Personalização", icon: PaletteIcon },
        { href: "/settings/audit", label: "Auditoria", icon: ClipboardCheckIcon },
        ...(isOwner ? [{ href: "/settings/configuracoes", label: "Configurações", icon: SlidersVerticalIcon }] : []),
      ],
    },
  ];
  const initials =
    username
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <Sidebar collapsible="icon" role="complementary" aria-label="Menu do painel">
      <SidebarHeader className="px-4 pt-5 pb-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <SidebarBrand brand={brand} />
      </SidebarHeader>

      <SidebarContent className="px-2 group-data-[collapsible=icon]:px-0">
        {groups.map((group) => (
          <SidebarGroup key={group.label} className="p-2 group-data-[collapsible=icon]:p-0">
            <SidebarGroupLabel className="h-6 text-[11px] font-semibold tracking-[0.09em] text-faint uppercase">{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1 group-data-[collapsible=icon]:items-center">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        className={ITEM_CLASS}
                        render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
                      >
                        <item.icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.badge !== undefined ? (
                        <SidebarMenuBadge className="top-1/2! right-3 h-[22px] min-w-[22px] -translate-y-1/2 rounded-full bg-muted px-1.5 text-xs">{item.badge}</SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <RecordingGauge usedBytes={recUsedBytes} capGb={recCapGb} cleanupGb={recCleanupGb} />

      <SidebarFooter className="gap-3 border-t border-sidebar-border p-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="btn-gradient grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold" aria-hidden="true">
            {initials}
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <UserMenu username={username} />
            {brand.name ? <p className="truncate px-2.5 text-xs leading-normal text-muted-foreground">{brand.name}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
          <ThemeToggle variant="outline" className="size-11 shrink-0 rounded-xl" />
          <form action={logoutAction} className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <Button type="submit" variant="outline" className="h-11 w-full rounded-xl">
              <LogOutIcon /> Sair
            </Button>
          </form>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
