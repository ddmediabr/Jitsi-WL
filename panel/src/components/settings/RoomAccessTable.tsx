"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StarterSwitch } from "@/components/settings/RoomForms";
import { Pager, SearchField, usePaged } from "@/components/settings/TableKit";
import { removeAccessAction, setAccessRoleAction } from "@/server/rooms/actions";

export type AccessRow = { username: string; name: string | null; role: "moderator" | "member"; canStart: boolean };

/** Controle de acesso da sala: Nome, usuário, permissão, moderador interino; busca por nome ou usuário; 15 por página. */
export default function RoomAccessTable({ room, rows }: { room: string; rows: AccessRow[] }) {
  const t = usePaged(rows, (r) => [r.name ?? "", r.username]);
  return (
    <div className="grid gap-4">
      {rows.length > 0 && <SearchField value={t.query} onChange={t.setQuery} label="Buscar na lista de acesso" placeholder="Buscar por nome ou usuário" />}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Permissão</TableHead>
              <TableHead>Moderador interino</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {t.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {rows.length === 0
                    ? "Ninguém na lista: todos entram como convidados, pela sala de espera, e ninguém modera."
                    : "Ninguém encontrado para essa busca."}
                </TableCell>
              </TableRow>
            ) : (
              t.rows.map((m) => (
                <TableRow key={m.username}>
                  <TableCell className="text-sm font-medium">{m.name ?? <span className="font-normal text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="font-mono text-sm">{m.username}</TableCell>
                  <TableCell>{m.role === "moderator" ? <Badge>Moderador</Badge> : <Badge variant="secondary">Usuário comum</Badge>}</TableCell>
                  <TableCell>
                    {m.role === "moderator" ? (
                      <span className="text-sm text-muted-foreground" aria-label="Não se aplica">
                        —
                      </span>
                    ) : (
                      <StarterSwitch room={room} username={m.username} initialValue={m.canStart} />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <form action={setAccessRoleAction}>
                        <input type="hidden" name="room" value={room} />
                        <input type="hidden" name="username" value={m.username} />
                        <input type="hidden" name="role" value={m.role === "moderator" ? "member" : "moderator"} />
                        <Button type="submit" variant="outline" size="sm" className="w-44">
                          {m.role === "moderator" ? "Tornar usuário comum" : "Tornar moderador"}
                        </Button>
                      </form>
                      <form action={removeAccessAction}>
                        <input type="hidden" name="room" value={room} />
                        <input type="hidden" name="username" value={m.username} />
                        <Button type="submit" variant="outline" size="sm">
                          Remover
                        </Button>
                      </form>
                    </div>
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
