"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager, SearchField, usePaged } from "@/components/settings/TableKit";

export type RoomRow = {
  name: string;
  mods: number;
  members: number;
  exclusive: boolean;
  lobby: boolean;
  createdAt: string;
  /** null = permanente; texto = "até 10/11 14:30" etc. */
  until: string | null;
};

const MODES = [
  { value: "all", label: "Todos os modos" },
  { value: "exclusive", label: "Exclusiva" },
  { value: "lobby", label: "Aberta, com lobby" },
  { value: "nolobby", label: "Aberta, sem lobby" },
] as const;
type Mode = (typeof MODES)[number]["value"];

const modeOf = (r: RoomRow): Exclude<Mode, "all"> => (r.exclusive ? "exclusive" : r.lobby ? "lobby" : "nolobby");

/** Tabela de salas: busca por nome em tempo real, filtro por modo e 15 por página. */
export default function RoomsTable({ rows }: { rows: RoomRow[] }) {
  const [mode, setMode] = useState<Mode>("all");
  const t = usePaged(rows, (r) => [r.name], mode === "all" ? undefined : (r) => modeOf(r) === mode);
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <SearchField value={t.query} onChange={t.setQuery} label="Buscar sala" placeholder="Buscar sala" />
        <Select
          items={MODES.map((m) => ({ value: m.value, label: m.label }))}
          value={mode}
          onValueChange={(v) => {
            setMode((v as Mode) ?? "all");
            t.resetPage();
          }}
        >
          <SelectTrigger aria-label="Filtrar por modo" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead>Sala</TableHead>
              <TableHead>Moderadores</TableHead>
              <TableHead>Usuários comuns</TableHead>
              <TableHead>Modo</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Criada em</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {t.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {rows.length === 0 ? "Nenhuma sala cadastrada. Sem sala, nenhum endereço abre." : "Nenhuma sala encontrada com esses filtros."}
                </TableCell>
              </TableRow>
            ) : (
              t.rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-mono text-sm">/{r.name}</TableCell>
                  <TableCell>
                    <Badge variant={r.mods === 0 ? "outline" : "secondary"}>{r.mods === 0 ? "nenhum" : r.mods}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.members === 0 ? "outline" : "secondary"}>{r.members === 0 ? "nenhum" : r.members}</Badge>
                  </TableCell>
                  <TableCell>
                    {r.exclusive ? <Badge>Exclusiva</Badge> : r.lobby ? <Badge variant="outline">Aberta, com lobby</Badge> : <Badge variant="outline">Aberta, sem lobby</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {r.until ? <Badge variant="outline">Temporária · {r.until}</Badge> : <span className="text-sm text-muted-foreground">Permanente</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{r.createdAt}</TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" render={<Link href={`/settings/rooms/${r.name}`} />}>
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
        <Pager page={t.page} pageCount={t.pageCount} total={t.total} pageSize={t.pageSize} onPage={t.setPage} />
      </div>
    </Card>
  );
}
