import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ChangePasswordForm from "@/components/settings/ChangePasswordForm";
import DisableTwoFactorForm from "@/components/settings/DisableTwoFactorForm";
import { revokeSessionAction } from "@/server/auth/actions";
import { requireFullAuth } from "@/server/auth/dal";
import { and, desc, eq, gt } from "drizzle-orm";
import { dateFormatter } from "@/lib/tz";
import { db } from "@/server/db";
import { getTimeZone } from "@/server/timezone";
import { session as authSession } from "@/server/db/auth-schema";
import { getSetting } from "@/server/settings";

export default async function SecurityPage() {
  const admin = await requireFullAuth();
  const FORMAT = dateFormatter(await getTimeZone(), { dateStyle: "short", timeStyle: "short" });
  // Lê direto do banco (só as sessões do próprio usuário): `listSessions` do Better Auth exige sessão
  // "recente" (5 min) e derrubava a página com erro 403 para quem entrou há mais tempo.
  const sessions = await db()
    .select({ id: authSession.id, createdAt: authSession.createdAt, ipAddress: authSession.ipAddress, userAgent: authSession.userAgent })
    .from(authSession)
    .where(and(eq(authSession.userId, admin.id), gt(authSession.expiresAt, new Date())))
    .orderBy(desc(authSession.createdAt));
  const required = await getSetting("require_2fa");

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-[34px] leading-tight font-bold">Segurança da conta</h1>
        <p className="max-w-none! text-[15px] leading-relaxed text-muted-foreground">
          Verificação em duas etapas, senha e sessões abertas de <strong>{admin.username}</strong>.
        </p>
      </div>

      <Card id="duas-etapas" className="scroll-mt-6">
        <CardContent className="grid gap-4 px-6 py-1">
          <div className="flex flex-wrap items-center gap-4">
            <h2 className="text-[19px] leading-snug font-semibold">Verificação em duas etapas</h2>
            {admin.twoFactorEnabled ? <Badge variant="secondary">Ativa</Badge> : <Badge variant="outline">Desativada</Badge>}
            {required && <Badge variant="outline">Exigida pelo painel</Badge>}
          </div>
          {admin.twoFactorEnabled ? (
            required ? (
              <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
                O painel exige a verificação em duas etapas, por isso não pode ser desativada.
              </p>
            ) : (
              <DisableTwoFactorForm />
            )
          ) : (
            <>
              <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
                <strong className="text-foreground">Recomendado.</strong> Uma senha vazada não basta: é preciso também o código do aplicativo autenticador.
              </p>
              <Button render={<Link href="/settings/security/2fa" />} className="w-fit">
                Ativar verificação em duas etapas
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card id="senha" className="scroll-mt-6">
        <CardContent className="grid gap-4 px-6 py-1">
          <h2 className="text-[19px] leading-snug font-semibold">Alterar a senha</h2>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card id="sessoes" className="scroll-mt-6">
        <CardContent className="grid gap-4 px-6 py-1">
          <h2 className="text-[19px] leading-snug font-semibold">Sessões abertas</h2>
          <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
            Cada sessão dura até 8 horas. Se não reconhecer uma, encerre-a e troque a senha.
          </p>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Iniciada em</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Navegador</TableHead>
                  <TableHead className="w-0">
                <span className="sr-only">Ações</span>
              </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">{FORMAT.format(s.createdAt)}</TableCell>
                    <TableCell className="font-mono text-xs">{s.ipAddress ?? "—"}</TableCell>
                    <TableCell className="max-w-[360px] truncate text-xs text-muted-foreground">{s.userAgent ?? "—"}</TableCell>
                    <TableCell>
                      {s.id === admin.sessionId ? (
                        <Badge variant="secondary">Esta sessão</Badge>
                      ) : (
                        <form action={revokeSessionAction}>
                          <input type="hidden" name="sessionId" value={s.id} />
                          <Button type="submit" variant="outline" size="sm">
                            Encerrar
                          </Button>
                        </form>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
