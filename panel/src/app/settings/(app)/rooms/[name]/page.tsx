import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { AccessSwitch, AddAccessForm, DeleteRoomForm, TemporaryRoomForm } from "@/components/settings/RoomForms";
import { isPast } from "@/lib/temporary-rooms";
import { accessOf, isRoomIcon } from "@/lib/hall";
import { RoomCardForm } from "@/components/settings/HallForms";
import PageTabs, { currentTab } from "@/components/settings/PageTabs";
import RoomAccessTable from "@/components/settings/RoomAccessTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireFullAuth } from "@/server/auth/dal";
import { dateFormatter } from "@/lib/tz";
import { db } from "@/server/db";
import { getTimeZone } from "@/server/timezone";
import { roomAccess, rooms } from "@/server/db/schema";
import { ROOM_NAME } from "@/server/policy";
import { listJitsiUsers } from "@/server/prosody/sync";
import { getProfileMap } from "@/server/users/profiles";


const TABS = [
  { id: "perfil", label: "Perfil" },
  { id: "recursos", label: "Recursos" },
  { id: "seguranca", label: "Segurança" },
] as const;

export default async function RoomPage({ params, searchParams }: { params: Promise<{ name: string }>; searchParams: Promise<{ aba?: string }> }) {
  await requireFullAuth();
  const tab = currentTab(TABS, (await searchParams).aba);

  // O parâmetro vem da URL: validado antes de tocar no banco.
  const { name } = await params;
  if (!ROOM_NAME.test(name)) notFound();
  const room = (await db().select().from(rooms).where(eq(rooms.name, name)).limit(1))[0];
  if (!room) notFound();
  const access = await db().select().from(roomAccess).where(eq(roomAccess.roomId, room.id)).orderBy(asc(roomAccess.username));

  // Contas do servidor que ainda não moderam esta sala (só quem edita precisa da lista).
  const all = await listJitsiUsers();
  const current = new Set(access.map((m) => m.username));
  const names = await getProfileMap();
  const available = all ? all.filter((u) => !current.has(u)).map((u) => ({ username: u, name: names.get(u) ?? null })) : null;

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/settings/rooms" />} className="w-fit">
          <ArrowLeftIcon /> Salas
        </Button>
        <h1 className="font-mono text-[34px] leading-tight font-bold">/{room.name}</h1>
      </div>

      <PageTabs tabs={TABS} current={tab} basePath={`/settings/rooms/${room.name}`} label="Seções da sala" />

      {tab === "perfil" ? (
        <>
      {room.kind === "permanent" && (
        <Card>
          <CardContent className="grid gap-4 px-6 py-1">
            <h2 className="text-[19px] leading-snug font-semibold">Cartão na página de entrada</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">Ícone e texto da sala na lista da página de entrada.</p>
            <RoomCardForm
              room={room.name}
              icon={isRoomIcon(room.icon) ? room.icon : null}
              description={room.description ?? ""}
              defaultIcon={accessOf(room).icon}
              defaultDescription={accessOf(room).description}
            />
          </CardContent>
        </Card>
      )}

      {room.kind === "temporary" && room.expiresAt && (
        <Card>
          <CardContent className="grid gap-4 px-6 py-1">
            <h2 className="text-[19px] leading-snug font-semibold">Sala temporária</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {isPast(room.expiresAt) ? "Prazo encerrado em " : "A sala existe até "}
              <strong className="font-medium text-foreground">{dateFormatter(await getTimeZone()).format(room.expiresAt)}</strong>. Depois disso ela é apagada e o endereço{" "}
              <span className="font-mono">/{room.name}</span> deixa de levar a qualquer lugar. Uma reunião em andamento não é cortada: a sala some quando ela acabar.
            </p>
            <TemporaryRoomForm room={room.name} />
          </CardContent>
        </Card>
      )}

        </>
      ) : tab === "recursos" ? (
        <>
      <Card>
        <CardContent className="grid gap-6 px-6 py-1">
          <h2 className="text-[19px] leading-snug font-semibold">Regras da sala</h2>
          <div className="grid gap-2">
            <AccessSwitch room={room.name} field="lobby" initialValue={room.lobby} label="Lobby de entrada" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="block">
                <strong className="font-medium text-foreground">Ligado</strong> → Usuários fora da lista de controle podem entrar mas devem
                aguardar a aprovação de um moderador/interino.
              </span>
              <span className="block">
                <strong className="font-medium text-foreground">Desligado</strong> → Sala livre. Qualquer pessoa pode entrar sem a
                necessidade de aprovação.
              </span>
            </p>
          </div>
          <div className="grid gap-2">
            <AccessSwitch room={room.name} field="exclusive" initialValue={room.exclusive} label="Sala exclusiva" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="block">
                <strong className="font-medium text-foreground">Ligado</strong> → Sala se torna exclusiva. Qualquer usuário fora da lista de
                controle recebe negativa de acesso direta, sem cair no lobby.
              </span>
              <span className="block">
                <strong className="font-medium text-foreground">Desligado</strong> → Sala aberta. Segue a regra de entrada com ou sem lobby.
              </span>
            </p>
          </div>
          <div className="grid gap-2">
            <AccessSwitch room={room.name} field="password" initialValue={room.password} label="Sala com senha" />
            <p className="text-sm leading-relaxed text-muted-foreground">
              <span className="block">
                <strong className="font-medium text-foreground">Ligado</strong> → Durante a reunião a sala ganha uma senha gerada pelo sistema e trocada a cada 10 minutos,
                visível no menu de quem modera. Quem recebe a senha de um moderador pode entrar direto, sem aguardar aprovação, pela opção “Entrar com senha” na página de
                entrada.
              </span>
              <span className="block">
                <strong className="font-medium text-foreground">Desligado</strong> → Senha desativada. Segue as regras de entrada com ou sem lobby.
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 px-6 py-1">
          <h2 className="text-[19px] leading-snug font-semibold">Controle de acesso</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="block">Quem está na lista tem acesso livre a sala sem necessidade de aprovação. Moderadores tem privilégios de moderação.</span>
            <span className="block">
              Usuários comuns com &quot;Moderador interino&quot; ligado, e na ausência de um moderador, podem receber privilégios de moderação temporários.
            </span>
          </p>
          <RoomAccessTable
            room={room.name}
            rows={access.map((m) => ({ username: m.username, name: names.get(m.username) ?? null, role: m.role === "moderator" ? "moderator" : "member", canStart: m.canStart }))}
          />
          <AddAccessForm room={room.name} available={available} />
        </CardContent>
      </Card>

        </>
      ) : (
        <>
        <Card>
          <CardContent className="grid gap-4 px-6 py-1">
            <h2 className="text-[19px] leading-snug font-semibold text-destructive">Apagar a sala</h2>
            <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
              A sala é apagada na hora. Não pode ser desfeito.
            </p>
            <DeleteRoomForm room={room.name} />
          </CardContent>
        </Card>
        </>
      )}
    </div>
  );
}
