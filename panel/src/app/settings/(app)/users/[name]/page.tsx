import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { AddToRoomForm, DeleteUserForm, DisplayNameForm, PhotoForm, ResetPasswordForm, InvisibleSwitch, EmailForm } from "@/components/settings/UserForms";
import PageTabs, { currentTab } from "@/components/settings/PageTabs";
import UserAccessTable from "@/components/settings/UserAccessTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireFullAuth } from "@/server/auth/dal";
import { db } from "@/server/db";
import { roomAccess, rooms } from "@/server/db/schema";
import { listJitsiUsers } from "@/server/prosody/sync";
import { getProfileView } from "@/server/users/profile-service";
import { validateUsername } from "@/server/users/rules";

const TABS = [
  { id: "perfil", label: "Perfil" },
  { id: "recursos", label: "Recursos" },
  { id: "seguranca", label: "Segurança" },
] as const;

export default async function UserPage({ params, searchParams }: { params: Promise<{ name: string }>; searchParams: Promise<{ aba?: string }> }) {
  await requireFullAuth();
  const tab = currentTab(TABS, (await searchParams).aba);

  // O parâmetro vem da URL: validado antes de tocar no banco ou no servidor.
  const v = validateUsername((await params).name);
  if (!v.ok) notFound();
  const username = v.name;

  const users = await listJitsiUsers();
  if (users === null || !users.includes(username)) notFound();

  const profile = await getProfileView(username);
  const displayName = profile.name === username ? "" : profile.name;
  const moderated = await db()
    .select({ name: rooms.name, role: roomAccess.role })
    .from(roomAccess)
    .innerJoin(rooms, eq(rooms.id, roomAccess.roomId))
    .where(eq(roomAccess.username, username))
    .orderBy(asc(rooms.name));

  const have = new Set(moderated.map((r) => r.name));
  const availableRooms = (await db().select({ name: rooms.name }).from(rooms).orderBy(asc(rooms.name))).map((r) => r.name).filter((n) => !have.has(n));

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/settings/users" />} className="w-fit">
          <ArrowLeftIcon /> Contas
        </Button>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-[34px] leading-tight font-bold">{displayName || username}</h1>
          {displayName && <span className="font-mono text-sm text-muted-foreground">[{username}]</span>}
        </div>
      </div>

      <PageTabs tabs={TABS} current={tab} basePath={`/settings/users/${username}`} label="Seções da conta" />

      {tab === "perfil" ? (
        <>
          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold">Nome de exibição</h2>
              <DisplayNameForm username={username} initialName={displayName} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold">E-mail</h2>
              <EmailForm username={username} initialEmail={profile.email ?? ""} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold">Foto de perfil</h2>
              <PhotoForm username={username} photoUrl={profile.photoUrl} />
            </CardContent>
          </Card>
        </>
      ) : tab === "recursos" ? (
        <>
          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold">Modo invisível</h2>
              <InvisibleSwitch username={username} initialValue={profile.invisibleAllowed} />
              <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
                Permite ao <strong className="font-medium text-foreground">moderador real</strong> entrar em uma sala em que tenha permissão como observador oculto: sem aparecer
                para participantes, sem câmera, microfone, chat nem comandos de moderação. Só os outros moderadores o veem, com o símbolo 👁.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold">Acesso às salas</h2>
              <UserAccessTable username={username} rows={moderated.map((r) => ({ name: r.name, role: r.role === "moderator" ? "moderator" : "member" }))} />
              <AddToRoomForm username={username} available={availableRooms} />
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold">Redefinir a senha</h2>
              <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">A senha antiga deixa de valer na hora. Quem está em reunião continua até sair.</p>
              <ResetPasswordForm username={username} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold text-destructive">Apagar a conta</h2>
              <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">A conta é removida do servidor e de todas as salas. Não pode ser desfeito.</p>
              <DeleteUserForm username={username} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
