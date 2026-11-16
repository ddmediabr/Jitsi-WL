import { asc, eq, sql } from "drizzle-orm";
import { CircleAlertIcon, CircleCheckIcon, RefreshCwIcon } from "lucide-react";
import NewItemDialog from "@/components/settings/NewItemDialog";
import PageTabs, { currentTab } from "@/components/settings/PageTabs";
import { CreateRoomForm } from "@/components/settings/RoomForms";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import RoomsTable from "@/components/settings/RoomsTable";
import TimingsForm from "@/components/settings/TimingsForm";
import { requireFullAuth } from "@/server/auth/dal";
import { getSetting } from "@/server/settings";
import { dateFormatter } from "@/lib/tz";
import { db } from "@/server/db";
import { getTimeZone } from "@/server/timezone";
import { roomAccess, rooms } from "@/server/db/schema";
import { readSyncStatus } from "@/server/prosody/sync";
import { syncNowAction } from "@/server/rooms/actions";

const TABS = [
  { id: "salas", label: "Salas" },
  { id: "configuracoes", label: "Configurações" },
] as const;

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  await requireFullAuth();
  const tab = currentTab(TABS, (await searchParams).aba);
  const FORMAT = dateFormatter(await getTimeZone(), {
    dateStyle: "short",
    timeStyle: "medium",
  });

  const list = await db()
    .select({
      id: rooms.id,
      name: rooms.name,
      createdAt: rooms.createdAt,
      mods: sql<number>`count(*) filter (where ${roomAccess.role} = 'moderator')`.mapWith(
        Number,
      ),
      members:
        sql<number>`count(*) filter (where ${roomAccess.role} = 'member')`.mapWith(
          Number,
        ),
      exclusive: rooms.exclusive,
      lobby: rooms.lobby,
      kind: rooms.kind,
      expiresAt: rooms.expiresAt,
    })
    .from(rooms)
    .leftJoin(roomAccess, eq(roomAccess.roomId, rooms.id))
    .groupBy(rooms.id)
    .orderBy(asc(rooms.name));
  const sync = await readSyncStatus();
  const reconnectMinutes = Math.max(
    1,
    Math.round((await getSetting("reconnect_pass_seconds")) / 60),
  );
  const rememberHours = Math.max(
    1,
    Math.round((await getSetting("remember_seconds")) / 3600),
  );

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-[34px] leading-tight font-bold">Salas</h1>
        <p className="max-w-none! text-[15px] leading-relaxed text-muted-foreground">
          Só as salas cadastradas aqui abrem. Em cada sala você define quem
          entra direto e se ela é exclusiva.
        </p>
      </div>

      <PageTabs
        tabs={TABS}
        current={tab}
        basePath="/settings/rooms"
        label="Seções de Salas"
      />

      {tab === "configuracoes" ? (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 px-6 py-1">
              {sync?.ok ? (
                <CircleCheckIcon
                  className="size-5 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              ) : (
                <CircleAlertIcon
                  className="size-5 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
              )}
              <div className="grid flex-1 gap-1">
                <p className="text-sm leading-normal font-medium">
                  {sync?.ok
                    ? "Servidor de reuniões sincronizado"
                    : "Servidor de reuniões ainda não sincronizado"}
                </p>
                <p className="text-xs leading-normal text-muted-foreground">
                  {sync
                    ? `${FORMAT.format(new Date(sync.at))}${sync.ok ? ` · ${sync.rooms ?? 0} sala(s)` : ` · ${sync.error ?? "erro"}`}`
                    : "Nenhuma sincronização registrada."}
                </p>
              </div>
              {
                <form action={syncNowAction}>
                  <Button type="submit" variant="outline" size="sm">
                    <RefreshCwIcon /> Sincronizar agora
                  </Button>
                </form>
              }
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-5 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold">
                Prazos de acesso
              </h2>
              <TimingsForm
                reconnectMinutes={reconnectMinutes}
                rememberHours={rememberHours}
              />
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <NewItemDialog label="Nova sala" title="Nova sala">
            <CreateRoomForm />
          </NewItemDialog>

          <RoomsTable
            rows={list.map((r) => ({
              name: r.name,
              mods: r.mods,
              members: r.members,
              exclusive: r.exclusive,
              lobby: r.lobby,
              createdAt: FORMAT.format(r.createdAt),
              until:
                r.kind === "temporary" && r.expiresAt
                  ? `até ${FORMAT.format(r.expiresAt)}`
                  : null,
            }))}
          />
        </>
      )}
    </div>
  );
}
