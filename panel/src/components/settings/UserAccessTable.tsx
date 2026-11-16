"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager, SearchField, usePaged } from "@/components/settings/TableKit";
import { removeUserFromAllRoomsAction, removeUserFromRoomAction } from "@/server/users/actions";

export type UserAccessRow = { name: string; role: "moderator" | "member" };

/** Salas a que a conta tem acesso: busca por nome da sala em tempo real e 15 por página. */
export default function UserAccessTable({ username, rows }: { username: string; rows: UserAccessRow[] }) {
  const t = usePaged(rows, (r) => [r.name]);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="grid gap-4">
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchField value={t.query} onChange={t.setQuery} label="Buscar sala" placeholder="Buscar sala" />
          {confirming ? (
            <form action={removeUserFromAllRoomsAction} className="flex flex-wrap items-center justify-end gap-2" role="alertdialog" aria-label="Confirmar a remoção de todas as salas">
              <input type="hidden" name="username" value={username} />
              <span className="text-sm">Remover a conta de todas as salas?</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} autoFocus>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" size="sm">
                Sim, remover de todas
              </Button>
            </form>
          ) : (
            <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
              Remover de todas as salas
            </Button>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sala</TableHead>
              <TableHead>Permissão</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {t.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                  {rows.length === 0
                    ? "Sem acesso a nenhuma sala: a conta cai na sala de espera como convidada em todas."
                    : "Nenhuma sala encontrada para essa busca."}
                </TableCell>
              </TableRow>
            ) : (
              t.rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-mono text-sm">
                    <Link href={`/settings/rooms/${r.name}`} className="hover:underline">
                      /{r.name}
                    </Link>
                  </TableCell>
                  <TableCell>{r.role === "moderator" ? <Badge>Moderador</Badge> : <Badge variant="secondary">Usuário comum</Badge>}</TableCell>
                  <TableCell>
                    <form action={removeUserFromRoomAction}>
                      <input type="hidden" name="username" value={username} />
                      <input type="hidden" name="room" value={r.name} />
                      <Button type="submit" variant="outline" size="sm" aria-label={`Remover de /${r.name}`}>
                        Remover
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pager page={t.page} pageCount={t.pageCount} total={t.total} pageSize={t.pageSize} onPage={t.setPage} />
    </div>
  );
}
