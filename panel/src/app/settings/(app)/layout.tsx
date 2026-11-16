import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { count, eq } from "drizzle-orm";
import AppSidebar from "@/components/settings/AppSidebar";
import BrandMark from "@/components/BrandMark";
import SecurityTip from "@/components/settings/SecurityTip";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { hasRole, requireFullAuth } from "@/server/auth/dal";
import { db } from "@/server/db";
import { user as userTable } from "@/server/db/auth-schema";
import { rooms } from "@/server/db/schema";
import { cleanupLimitGb, recordingsUsage } from "@/server/recordings/purge";
import { getSetting } from "@/server/settings";

/** Casca das telas autenticadas: exige sessão + 2FA em TODA requisição (não só no proxy). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const admin = await requireFullAuth();

  // Tarja de segurança: só no primeiro acesso à conta (marcado no banco ao exibir) e só sem 2FA.
  let showTip = false;
  if (!admin.twoFactorEnabled) {
    const row = (await db().select({ seen: userTable.securityTipSeenAt }).from(userTable).where(eq(userTable.id, admin.id)).limit(1))[0];
    if (row && row.seen === null) {
      showTip = true;
      await db().update(userTable).set({ securityTipSeenAt: new Date() }).where(eq(userTable.id, admin.id));
    }
  }

  const roomCount = (await db().select({ n: count() }).from(rooms))[0]?.n ?? 0;
  const [recUsage, recCapGb] = await Promise.all([recordingsUsage(), getSetting("recording_max_gb")]);
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen} style={{ "--sidebar-width": "16.5rem" } as React.CSSProperties}>
      <AppSidebar username={admin.username} isOwner={hasRole(admin, "owner")} roomCount={roomCount} recUsedBytes={recUsage.bytes} recCapGb={recCapGb} recCleanupGb={cleanupLimitGb(recCapGb)} />
      <SidebarInset className="page-glow min-w-0">
        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background px-5 md:hidden">
          <SidebarTrigger className="size-11" aria-label="Abrir o menu" />
          <BrandMark />
        </div>
        <div className={showTip ? "mx-auto w-full max-w-[1200px] px-[clamp(20px,4vw,48px)] pt-11 pb-28" : "mx-auto w-full max-w-[1200px] px-[clamp(20px,4vw,48px)] pt-11 pb-11"}>{children}</div>
        {showTip && <SecurityTip />}
      </SidebarInset>
    </SidebarProvider>
  );
}
