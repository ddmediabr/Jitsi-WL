import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { ActivityIcon, ArrowUpRightIcon, CircleAlertIcon, EyeOffIcon, ShieldIcon, UsersIcon, VideoIcon, type LucideIcon } from "lucide-react";
import Elapsed from "@/components/settings/Elapsed";
import RefreshBar from "@/components/settings/RefreshBar";
import RoomCarousel from "@/components/settings/RoomCarousel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireFullAuth } from "@/server/auth/dal";
import { getBrand } from "@/server/brand/brand";
import { db } from "@/server/db";
import { roomAccess, rooms } from "@/server/db/schema";
import { getLiveRooms, type LiveParticipant } from "@/server/prosody/live";

/** Card de métrica (DESIGN.md): rótulo e ícone em cima, o número grande embaixo. */
function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <Card>
      <CardContent className="grid gap-[18px]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] leading-normal font-medium text-muted-foreground">{label}</span>
          <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-icon-bg text-icon-fg" aria-hidden="true">
            <Icon className="size-[18px]" />
          </span>
        </div>
        <span className="font-heading text-[38px] leading-none font-bold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  );
}

/** Círculo com M (moderador) ou C (usuário comum). Convidados não recebem selo. */
function RoleBadge({ level }: { level: "moderator" | "member" | "interim" }) {
  const label = level === "moderator" ? "Moderador" : level === "interim" ? "Moderador interino" : "Usuário comum";
  const letter = level === "moderator" ? "M" : level === "interim" ? "I" : "C";
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-grid size-5 shrink-0 place-items-center rounded-full text-[11px] leading-none font-semibold ${
        level === "moderator"
          ? "bg-primary text-primary-foreground"
          : level === "interim"
            ? "border border-primary text-primary"
            : "bg-secondary text-secondary-foreground"
      }`}
    >
      {letter}
    </span>
  );
}

function ParticipantRow({ p }: { p: LiveParticipant }) {
  return (
    <li className="flex min-w-0 items-center gap-2 text-sm leading-normal">
      <span className="min-w-0 truncate">
        <span className="font-medium">{p.name || "Sem nome"}</span>
        {p.user && <span className="font-mono text-xs text-muted-foreground"> [{p.user}]</span>}
      </span>
      {p.kind === "registered" && p.level && <RoleBadge level={p.interim ? "interim" : p.level} />}
      {p.invisible && (
        <span role="img" aria-label="Observador invisível: só moderadores o veem" title="Observador invisível: só moderadores o veem" className="inline-flex shrink-0 text-muted-foreground">
          <EyeOffIcon className="size-3.5" aria-hidden="true" />
        </span>
      )}
    </li>
  );
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ negado?: string }>;
}) {
  const admin = await requireFullAuth();
  const { negado } = await searchParams;
  const brand = await getBrand();

  const all = await db().select({ name: rooms.name }).from(rooms).orderBy(asc(rooms.name));
  const modCounts = new Map(
    (
      await db()
        .select({ id: rooms.name, n: count() })
        .from(roomAccess)
        .innerJoin(rooms, eq(rooms.id, roomAccess.roomId))
        .where(eq(roomAccess.role, "moderator"))
        .groupBy(rooms.name)
    ).map((r) => [r.id, r.n]),
  );
  const live = await getLiveRooms(); // null = sem estado ao vivo
  const liveBy = new Map((live ?? []).map((r) => [r.name, r]));

  const cards = all
    .map((r) => {
      const room = liveBy.get(r.name);
      const people = room?.participants ?? [];
      return {
        name: r.name,
        people,
        active: people.length > 0,
        elapsed: room?.elapsed ?? null,
        registeredMods: modCounts.get(r.name) ?? 0,
      };
    })
    // Salas com reunião primeiro, depois por nome.
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  const activeRooms = cards.filter((c) => c.active).length;
  const participants = cards.reduce((n, c) => n + c.people.length, 0);
  const moderatorsOnline = cards.reduce((n, c) => n + c.people.filter((p) => p.moderator && !p.interim).length, 0);

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="grid gap-2">
          <h1 className="text-[34px] leading-tight font-bold">Olá, {brand.name || admin.name}</h1>
          <p className="max-w-none! text-[15px] leading-relaxed text-muted-foreground">Panorama das salas agora.</p>
        </div>
        <RefreshBar seconds={60} />
      </div>

      {negado && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>Você não tem permissão para acessar essa área.</AlertDescription>
        </Alert>
      )}

      {live === null && (
        <Alert role="status">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>
            Não foi possível consultar as reuniões agora. As salas aparecem sem o estado ao vivo.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] gap-4">
        <Stat label="Salas cadastradas" value={cards.length} icon={VideoIcon} />
        <Stat label="Reuniões em andamento" value={live === null ? 0 : activeRooms} icon={ActivityIcon} />
        <Stat label="Participantes agora" value={live === null ? 0 : participants} icon={UsersIcon} />
        <Stat label="Moderadores online" value={live === null ? 0 : moderatorsOnline} icon={ShieldIcon} />
      </div>

      <section className="grid gap-4" aria-labelledby="salas-titulo">
        <div className="flex items-center justify-between gap-4">
          <h2 id="salas-titulo" className="text-[19px] leading-tight font-semibold">
            Salas
          </h2>
          <Link href="/settings/rooms" className="inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-link outline-offset-4 hover:underline focus-visible:outline-2">
            Gerenciar salas <ArrowUpRightIcon className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {cards.length === 0 ? (
          <Card>
            <CardContent className="grid gap-3">
              <p className="text-sm leading-relaxed text-muted-foreground">Nenhuma sala cadastrada ainda.</p>
              <Button variant="outline" size="sm" render={<Link href="/settings/rooms" />} className="w-fit">
                Cadastrar a primeira sala
              </Button>
            </CardContent>
          </Card>
        ) : (
          <RoomCarousel>
            {cards.map((c) => {
              const mods = `${c.registeredMods} ${c.registeredMods === 1 ? "moderador" : "moderadores"}`;
              return (
                <Card key={c.name}>
                  <CardContent className="grid content-between gap-7">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <Link href={`/settings/rooms/${c.name}`} className="inline-flex min-w-0 items-center gap-2 font-mono text-[17px] font-semibold hover:underline">
                        <span className="truncate">/{c.name}</span>
                        <ArrowUpRightIcon className="size-4 shrink-0 text-link" aria-hidden="true" />
                      </Link>
                      <span className="inline-flex shrink-0 items-center gap-2 text-[13px] leading-normal text-muted-foreground" title={`${mods} cadastrados`}>
                        <ShieldIcon className="size-4" aria-hidden="true" />
                        {mods}
                      </span>
                    </div>

                    {live !== null && c.active && (
                      <ul className="grid gap-2">
                        {c.people.map((p, i) => (
                          <ParticipantRow key={`${p.user ?? p.name}-${i}`} p={p} />
                        ))}
                      </ul>
                    )}

                    {live !== null && (
                      <span className="inline-flex items-center gap-2 text-xs leading-normal font-medium text-muted-foreground">
                        <span aria-hidden="true" className={`size-2 rounded-full ${c.active ? "bg-[#0b7a4f] dark:bg-[#34d399]" : "bg-status-off"}`} />
                        {c.active ? "Em andamento" : "Sem reunião"}
                        {c.active && c.elapsed !== null && <Elapsed base={c.elapsed} />}
                      </span>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </RoomCarousel>
        )}
      </section>
    </div>
  );
}
