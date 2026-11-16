import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import ApplyRecorderForm from "@/components/settings/ApplyRecorderForm";
import NewItemDialog from "@/components/settings/NewItemDialog";
import PageTabs, { currentTab } from "@/components/settings/PageTabs";
import { CreatePanelUserForm } from "@/components/settings/PanelUserForms";
import RecordingLimitsForm from "@/components/settings/RecordingLimitsForm";
import RecordingQualityForm from "@/components/settings/RecordingQualityForm";
import ShareForm from "@/components/settings/ShareForm";
import TranscriptionSettingsForm from "@/components/settings/TranscriptionSettingsForm";
import { transcriptionConfigured } from "@/server/transcription/queue";
import TimeZoneForm from "@/components/settings/TimeZoneForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { effectiveQuality, isQuality, type RecordingQuality } from "@/lib/recording-quality";
import { dateFormatter } from "@/lib/tz";
import { setRequireTwoFactorAction } from "@/server/auth/actions";
import { requireFullAuth } from "@/server/auth/dal";
import { db } from "@/server/db";
import { user as userTable } from "@/server/db/auth-schema";
import { recordings } from "@/server/db/schema";
import { recordingsUsage } from "@/server/recordings/purge";
import { recorderRestartConfigured } from "@/server/recordings/restart";
import { getSetting } from "@/server/settings";
import { getTimeZone } from "@/server/timezone";

/** Configurações do painel: só o proprietário. Sistema (organização e fuso), Sala (Live) (compartilhamento e gravação) e usuários do painel. */
const TABS = [
  { id: "sistema", label: "Sistema" },
  { id: "sala", label: "Sala (Live)" },
  { id: "usuarios", label: "Usuários" },
] as const;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await requireFullAuth("owner");
  const tab = currentTab(TABS, (await searchParams).aba);
  const tz = await getTimeZone();
  const required = await getSetting("require_2fa");

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-[34px] leading-tight font-bold">Configurações</h1>
        <p className="max-w-none! text-[15px] leading-relaxed text-muted-foreground">Regras para todo o painel. Só o proprietário acessa.</p>
      </div>

      <PageTabs tabs={TABS} current={tab} basePath="/settings/configuracoes" label="Seções de Configurações" />

      {tab === "sistema" ? (
        <>
          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold">Política da organização</h2>
              <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
                {required
                  ? "Todos os administradores precisam ativar a verificação em duas etapas."
                  : "A verificação em duas etapas é opcional. Recomendamos exigi-la quando a plataforma entrar em uso."}
              </p>
              <form action={setRequireTwoFactorAction}>
                <input type="hidden" name="value" value={required ? "off" : "on"} />
                <Button type="submit" variant={required ? "outline" : "default"} className="w-fit">
                  {required ? "Deixar de exigir a verificação em duas etapas" : "Exigir verificação em duas etapas de todos"}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-4 px-6 py-1">
              <h2 className="text-[19px] leading-snug font-semibold">Fuso horário</h2>
              <TimeZoneForm current={tz} zones={Intl.supportedValuesOf("timeZone")} now={dateFormatter(tz, { dateStyle: "short", timeStyle: "medium" }).format(new Date())} />
            </CardContent>
          </Card>
        </>
      ) : tab === "sala" ? (
        <RoomLiveTab />
      ) : (
        <UsersTab tz={tz} />
      )}
    </div>
  );
}

/** Aba "Sala (Live)": como a reunião se comporta para quem participa e para a gravação. */
async function RoomLiveTab() {
  const [shareFps, recRetention, recMaxGb, recUsage, storedQuality, dedicated, latest, trGlossary] = await Promise.all([
    getSetting("share_fps"),
    getSetting("recording_retention_days"),
    getSetting("recording_max_gb"),
    recordingsUsage(),
    getSetting("recording_quality"),
    getSetting("recording_dedicated"),
    db().select({ resolution: recordings.resolution }).from(recordings).orderBy(desc(recordings.startedAt)).limit(1),
    getSetting("transcription_glossary"),
  ]);
  const usedGb = recUsage.bytes / 1024 ** 3;
  const quality: RecordingQuality = effectiveQuality(isQuality(storedQuality) ? storedQuality : "900p", dedicated);
  return (
    <>
      <Card>
        <CardContent className="grid gap-4 px-6 py-1">
          <h2 className="text-[19px] leading-snug font-semibold">Compartilhamento de tela</h2>
          <ShareForm fps={shareFps} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-4 px-6 py-1">
          <h2 className="text-[19px] leading-snug font-semibold">Gravações</h2>
          <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
            Em uso: {usedGb < 0.1 ? "menos de 0,1" : usedGb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB de {recMaxGb} GB · {recUsage.count} gravação(ões).
          </p>
          <RecordingLimitsForm retentionDays={recRetention} maxGb={recMaxGb} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-5 px-6 py-1">
          <h2 className="text-[19px] leading-snug font-semibold">Qualidade da gravação</h2>
          <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">
            Em uso pelo gravador agora: <strong className="font-medium text-foreground">{latest[0]?.resolution ?? "ainda sem gravação"}</strong>. A mudança vale quando o gravador reiniciar.
          </p>
          <RecordingQualityForm quality={quality} dedicated={dedicated} />
          <ApplyRecorderForm configured={recorderRestartConfigured()} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-4 px-6 py-1">
          <h2 className="text-[19px] leading-snug font-semibold">Transcrição e resumo (IA)</h2>
          <TranscriptionSettingsForm glossary={trGlossary} keyConfigured={transcriptionConfigured()} />
        </CardContent>
      </Card>
    </>
  );
}

/** Aba "Usuários": administradores do painel. */
async function UsersTab({ tz }: { tz: string }) {
  const DATE = dateFormatter(tz, { dateStyle: "short" });
  const panelUsers = await db()
    .select({ username: userTable.username, name: userTable.name, role: userTable.role, twoFactorEnabled: userTable.twoFactorEnabled, createdAt: userTable.createdAt })
    .from(userTable)
    .orderBy(asc(userTable.createdAt));
  return (
    <>
      <NewItemDialog label="Novo usuário" title="Novo usuário do painel">
        <CreatePanelUserForm />
      </NewItemDialog>

      <Card>
        <CardContent className="grid gap-4 px-6 py-1">
          <h2 className="text-[19px] leading-snug font-semibold">Usuários do painel</h2>
          <p className="max-w-[800px] text-sm leading-relaxed text-muted-foreground">Administradores têm acesso completo, menos a esta área.</p>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>2 etapas</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {panelUsers.map((u) => (
                  <TableRow key={u.username ?? u.name}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="font-mono text-sm">{u.username}</TableCell>
                    <TableCell>{u.role === "owner" ? <Badge>Proprietário</Badge> : <Badge variant="secondary">Administrador</Badge>}</TableCell>
                    <TableCell>{u.twoFactorEnabled ? "Ativa" : "—"}</TableCell>
                    <TableCell>{DATE.format(u.createdAt)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" render={<Link href={`/settings/configuracoes/usuarios/${u.username}`} />}>
                        Gerenciar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
