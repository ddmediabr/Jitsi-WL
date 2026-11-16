"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pager, SearchField, usePaged } from "@/components/settings/TableKit";
import { zonedDayBoundary } from "@/lib/tz";
import TranscriptionCell, { type RunInfo } from "@/components/settings/TranscriptionCell";
import { deleteRecordingAction } from "@/server/recordings/actions";

export type RecordingRow = { id: string; startedAt: string; room: string; started: string; duration: string; size: string; initiator: string | null; runs: RunInfo[] };

const NONE = "__none";

export default function RecordingsTable({ rows, timeZone, canDelete, transcriptionConfigured }: { rows: RecordingRow[]; timeZone: string; canDelete: boolean; transcriptionConfigured: boolean }) {
  const router = useRouter();
  const anyActive = rows.some((r) => r.runs.some((x) => x.status === "queued" || x.status === "processing" || x.status === "waiting"));
  // Enquanto há transcrição em andamento, a lista se atualiza sozinha.
  useEffect(() => {
    if (!anyActive) return;
    const t = window.setInterval(() => router.refresh(), 8000);
    return () => window.clearInterval(t);
  }, [anyActive, router]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [user, setUser] = useState("all");
  const users = [...new Set(rows.map((r) => r.initiator).filter((u): u is string => !!u))].sort();
  const userItems = [{ value: "all", label: "Todos os usuários" }, ...users.map((u) => ({ value: u, label: u })), ...(rows.some((r) => !r.initiator) ? [{ value: NONE, label: "Sem registro" }] : [])];
  const start = zonedDayBoundary(from, false, timeZone)?.getTime() ?? null;
  const end = zonedDayBoundary(to, true, timeZone)?.getTime() ?? null;
  const t = usePaged(
    rows,
    (r) => [r.room, r.initiator ?? ""],
    (r) => {
      const at = new Date(r.startedAt).getTime();
      if (start !== null && at < start) return false;
      if (end !== null && at > end) return false;
      if (user === NONE) return !r.initiator;
      return user === "all" || r.initiator === user;
    },
  );
  const filtering = from !== "" || to !== "" || user !== "all";
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-end gap-3 p-4">
        <SearchField value={t.query} onChange={t.setQuery} label="Buscar gravação" placeholder="Buscar por sala ou moderador" />
        <div className="grid gap-1.5">
          <Label htmlFor="rec-de">De</Label>
          <Input id="rec-de" type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); t.resetPage(); }} className="w-44" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rec-ate">Até</Label>
          <Input id="rec-ate" type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); t.resetPage(); }} className="w-44" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rec-user">Iniciada por</Label>
          <Select items={userItems} value={user} onValueChange={(v) => { setUser(v ?? "all"); t.resetPage(); }}>
            <SelectTrigger id="rec-user" className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {userItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filtering ? (
          <Button type="button" variant="ghost" onClick={() => { setFrom(""); setTo(""); setUser("all"); t.resetPage(); }}>
            Limpar filtros
          </Button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead>Sala</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Duração</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead>Iniciada por</TableHead>
              <TableHead>Transcrição</TableHead>
              <TableHead className="w-0">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {t.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  {rows.length === 0 ? "Nenhuma gravação ainda." : "Nenhuma gravação encontrada para esses filtros."}
                </TableCell>
              </TableRow>
            ) : (
              t.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.room}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.started}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.duration}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.size}</TableCell>
                  <TableCell>{r.initiator ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell>
                    <TranscriptionCell recordingId={r.id} runs={r.runs} configured={transcriptionConfigured} isOwner={canDelete} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" render={<a href={`/settings/gravacoes/${r.id}/download`} download />}>
                        <DownloadIcon aria-hidden="true" /> Baixar
                      </Button>
                      {canDelete ? (
                        <Dialog>
                          <DialogTrigger render={<Button variant="outline" size="sm" aria-label={`Apagar gravação de ${r.room}`} />}>
                            <Trash2Icon aria-hidden="true" />
                          </DialogTrigger>
                          <DialogContent>
                            <DialogTitle>Apagar gravação?</DialogTitle>
                            <DialogDescription>
                              A gravação da sala {r.room} ({r.started}) será apagada do servidor. Não pode ser desfeito.
                            </DialogDescription>
                            <form action={deleteRecordingAction} className="flex justify-end gap-2">
                              <input type="hidden" name="id" value={r.id} />
                              <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
                              <Button type="submit" variant="destructive">
                                Apagar
                              </Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                      ) : null}
                    </div>
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
