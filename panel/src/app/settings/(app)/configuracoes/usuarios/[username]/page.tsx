import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import {
  ChangeRoleForm,
  DeletePanelUserForm,
  EndSessionsForm,
  ResetPanelPasswordForm,
  ResetTwoFactorForm,
} from "@/components/settings/PanelUserForms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireFullAuth } from "@/server/auth/dal";
import { db } from "@/server/db";
import { session as authSession, user as userTable } from "@/server/db/auth-schema";
import { and, count, gt } from "drizzle-orm";

const PANEL_USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** Um usuário do painel: só o proprietário (a checagem é do servidor, não do menu). */
export default async function PanelUserPage({ params }: { params: Promise<{ username: string }> }) {
  const me = await requireFullAuth("owner");
  const username = (await params).username;
  if (!PANEL_USERNAME.test(username)) notFound();

  const [u] = await db()
    .select({ id: userTable.id, name: userTable.name, role: userTable.role, twoFactorEnabled: userTable.twoFactorEnabled })
    .from(userTable)
    .where(eq(userTable.username, username))
    .limit(1);
  if (!u || (u.role !== "owner" && u.role !== "admin")) notFound();
  const [{ n: sessions }] = await db()
    .select({ n: count() })
    .from(authSession)
    .where(and(eq(authSession.userId, u.id), gt(authSession.expiresAt, new Date())));
  const isMe = username === me.username;

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/settings/configuracoes?aba=usuarios" />} className="w-fit">
          <ArrowLeftIcon /> Configurações
        </Button>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-[34px] leading-tight font-bold">{u.name}</h1>
          <span className="font-mono text-sm text-muted-foreground">[{username}]</span>
          {u.role === "owner" ? <Badge>Proprietário</Badge> : <Badge variant="secondary">Administrador</Badge>}
          {isMe && <Badge variant="outline">você</Badge>}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Verificação em duas etapas: {u.twoFactorEnabled ? "ativa" : "não ativada"} · Sessões abertas agora: {sessions}
        </p>
      </div>

      {isMe ? (
        <Card>
          <CardContent className="grid gap-2 px-6 py-1">
            <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
              Esta é a sua conta. Troque a senha ou o 2FA em Segurança. Você não pode mudar o seu papel nem apagar a conta.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold">Papel</h2>
              <ChangeRoleForm username={username} role={u.role} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold">Redefinir a senha</h2>
              <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
                A senha antiga deixa de valer e as sessões abertas são encerradas.
              </p>
              <ResetPanelPasswordForm username={username} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold">Acesso</h2>
              <EndSessionsForm username={username} />
              {u.twoFactorEnabled && (
                <>
                  <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
                    Para quem perdeu o celular e os códigos: remove o 2FA, e a pessoa cadastra de novo no próximo acesso.
                  </p>
                  <ResetTwoFactorForm username={username} />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold text-destructive">Apagar o usuário</h2>
              <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
                O usuário perde o acesso e as sessões são encerradas. Não pode ser desfeito.
              </p>
              <DeletePanelUserForm username={username} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
