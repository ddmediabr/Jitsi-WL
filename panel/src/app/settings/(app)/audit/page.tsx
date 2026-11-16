import Link from "next/link";
import { and, count, desc, gte, ilike, lte, or, sql } from "drizzle-orm";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireFullAuth } from "@/server/auth/dal";
import { dateFormatter, zonedDayBoundary } from "@/lib/tz";
import { db } from "@/server/db";
import { getTimeZone } from "@/server/timezone";
import { auditLog } from "@/server/db/schema";

/** Eventos por página. O histórico inteiro fica guardado (só o painel escreve nele, poucas linhas por dia); a página só lê um recorte. */
const PAGE_SIZE = 100;

/** Escapa os curingas do LIKE para o texto digitado valer literalmente. */
const likeEscape = (v: string) => v.replace(/[\\%_]/g, "\\$&");

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; usuario?: string; pagina?: string }>;
}) {
  await requireFullAuth();
  const tz = await getTimeZone();
  const FORMAT = dateFormatter(tz, { dateStyle: "short", timeStyle: "medium" });
  const q = await searchParams;
  const de = typeof q.de === "string" ? q.de : "";
  const ate = typeof q.ate === "string" ? q.ate : "";
  const usuario = (typeof q.usuario === "string" ? q.usuario : "").trim().slice(0, 64);

  const from = zonedDayBoundary(de, false, tz);
  const to = zonedDayBoundary(ate, true, tz);
  const filters = [];
  if (from) filters.push(gte(auditLog.at, from));
  if (to) filters.push(lte(auditLog.at, to));
  if (usuario) {
    // "Usuário": quem fez a ação (administrador do painel) ou o alvo/conta citada no evento.
    const pattern = `%${likeEscape(usuario)}%`;
    filters.push(
      or(
        ilike(auditLog.actorLabel, pattern),
        ilike(auditLog.targetId, pattern),
        sql`${auditLog.details}->>'usuario' ilike ${pattern}`,
      ),
    );
  }

  const where = filters.length ? and(...filters) : undefined;
  const [{ total }] = await db().select({ total: count() }).from(auditLog).where(where);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const requested = /^\d{1,6}$/.test(q.pagina ?? "") ? Number(q.pagina) : 1;
  const page = Math.min(Math.max(1, requested), pageCount);
  const rows = await db()
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const filtered = filters.length > 0;

  const link = (p: number) => {
    const params = new URLSearchParams();
    if (from) params.set("de", de);
    if (to) params.set("ate", ate);
    if (usuario) params.set("usuario", usuario);
    if (p > 1) params.set("pagina", String(p));
    const qs = params.toString();
    return `/settings/audit${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-[34px] leading-tight font-bold">Auditoria</h1>
        <p className="max-w-none! text-[15px] leading-relaxed text-muted-foreground">
          Exibindo {rows.length} de {total} {total === 1 ? "evento" : "eventos"}
          {filtered ? " no filtro" : " no histórico"}, do mais recente para o mais antigo.
        </p>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
      <form method="get" className="flex flex-wrap items-end gap-4 p-4">
        <div className="grid gap-2">
          <Label htmlFor="audit-de">De</Label>
          <Input id="audit-de" name="de" type="date" defaultValue={from ? de : ""} className="w-44" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audit-ate">Até</Label>
          <Input id="audit-ate" name="ate" type="date" defaultValue={to ? ate : ""} className="w-44" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="audit-usuario">Usuário</Label>
          <Input
            id="audit-usuario"
            name="usuario"
            type="text"
            defaultValue={usuario}
            maxLength={64}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="quem fez ou conta citada"
            className="w-64"
          />
        </div>
        <Button type="submit">Filtrar</Button>
        {filtered && (
          <Button variant="ghost" render={<Link href="/settings/audit" />}>
            Limpar
          </Button>
        )}
      </form>

      <div className="overflow-x-auto">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Quem</TableHead>
              <TableHead>Alvo</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {filtered ? "Nenhum evento com esses filtros." : "Nenhum evento ainda."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{FORMAT.format(r.at)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.action}</TableCell>
                  <TableCell>{r.actorLabel ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.targetId ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.ip ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3.5">
          <p className="text-[13px] leading-normal text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(total, page * PAGE_SIZE)} de {total}
          </p>
          {pageCount > 1 && (
            <nav aria-label="Paginação" className="flex items-center gap-2">
              {page > 1 ? (
                <Button variant="outline" size="sm" render={<Link href={link(page - 1)} />}>
                  <ChevronLeftIcon /> Anterior
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  <ChevronLeftIcon /> Anterior
                </Button>
              )}
              <span className="text-sm leading-normal text-muted-foreground tabular-nums">
                Página {page} de {pageCount}
              </span>
              {page < pageCount ? (
                <Button variant="outline" size="sm" render={<Link href={link(page + 1)} />}>
                  Próxima <ChevronRightIcon />
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Próxima <ChevronRightIcon />
                </Button>
              )}
            </nav>
          )}
        </div>
      )}
      </Card>
    </div>
  );
}
