"use client";

import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { ChevronDownIcon, KeyRoundIcon, MonitorSmartphoneIcon, ShieldCheckIcon } from "lucide-react";

const ITEM =
  "flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm leading-normal outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

/** Menu do usuário (nome no cabeçalho): leva às opções de segurança da conta. */
export default function UserMenu({ username }: { username: string }) {
  return (
    <Menu.Root>
      <Menu.Trigger className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm leading-normal text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-muted data-popup-open:text-foreground">
        {username}
        <ChevronDownIcon className="size-4" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={6} className="isolate z-50">
          <Menu.Popup className="min-w-60 origin-(--transform-origin) rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Menu.Group>
              <Menu.GroupLabel className="px-2 py-1.5 text-xs text-muted-foreground">Segurança da conta</Menu.GroupLabel>
              <Menu.Item className={ITEM} render={<Link href="/settings/security#duas-etapas" />}>
                <ShieldCheckIcon aria-hidden="true" /> Verificação em duas etapas
              </Menu.Item>
              <Menu.Item className={ITEM} render={<Link href="/settings/security#senha" />}>
                <KeyRoundIcon aria-hidden="true" /> Alterar a senha
              </Menu.Item>
              <Menu.Item className={ITEM} render={<Link href="/settings/security#sessoes" />}>
                <MonitorSmartphoneIcon aria-hidden="true" /> Sessões abertas
              </Menu.Item>
            </Menu.Group>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
