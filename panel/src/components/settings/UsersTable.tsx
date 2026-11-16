"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pager, SearchField, usePaged } from "@/components/settings/TableKit";

export type UserRow = { username: string; name: string | null; rooms: number };

/** Tabela de contas Jitsi: Nome, usuário, salas; busca em tempo real por nome ou usuário; 15 por página. */
export default function UsersTable({
  rows,
  available,
}: {
  rows: UserRow[];
  available: boolean;
}) {
  const t = usePaged(rows, (r) => [r.name ?? "", r.username]);
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="p-4">
        <SearchField
          value={t.query}
          onChange={t.setQuery}
          label="Buscar conta"
          placeholder="Buscar por nome ou usuário"
        />
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Salas com acesso</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {t.rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-muted-foreground"
                >
                  {!available
                    ? "Lista indisponível."
                    : rows.length === 0
                      ? "Nenhuma conta ainda."
                      : "Nenhuma conta encontrada para essa busca."}
                </TableCell>
              </TableRow>
            ) : (
              t.rows.map((u) => (
                <TableRow key={u.username}>
                  <TableCell className="text-sm font-medium">
                    {u.name ?? (
                      <span className="font-normal text-muted-foreground">
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {u.username}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.rooms === 0 ? "outline" : "secondary"}>
                      {u.rooms}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/settings/users/${u.username}`} />}
                    >
                      Abrir
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-5 py-3.5 empty:hidden">
        <Pager
          page={t.page}
          pageCount={t.pageCount}
          total={t.total}
          pageSize={t.pageSize}
          onPage={t.setPage}
        />
      </div>
    </Card>
  );
}
