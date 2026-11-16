import { count } from "drizzle-orm";
import { CircleAlertIcon } from "lucide-react";
import { CreateUserForm } from "@/components/settings/UserForms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import NewItemDialog from "@/components/settings/NewItemDialog";
import UsersTable from "@/components/settings/UsersTable";
import { requireFullAuth } from "@/server/auth/dal";
import { db } from "@/server/db";
import { roomAccess } from "@/server/db/schema";
import { listJitsiUsers } from "@/server/prosody/sync";
import { getProfileMap } from "@/server/users/profiles";

export default async function UsersPage() {
  await requireFullAuth();

  const users = await listJitsiUsers(); // null = servidor de reuniões inacessível
  const modCounts = new Map(
    (await db().select({ u: roomAccess.username, n: count() }).from(roomAccess).groupBy(roomAccess.username)).map((r) => [r.u, r.n]),
  );

  const names = await getProfileMap();
  const rows = (users ?? []).map((u) => ({ username: u, name: names.get(u) ?? null, rooms: modCounts.get(u) ?? 0 }));

  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-[34px] leading-tight font-bold">Contas Jitsi</h1>
        <p className="max-w-none! text-[15px] leading-relaxed text-muted-foreground">
          Contas que entram como moderador nas salas em que forem cadastradas. As senhas ficam só no servidor de reuniões.
        </p>
      </div>

      <NewItemDialog label="Nova conta" title="Nova conta">
        <CreateUserForm />
      </NewItemDialog>

      {users === null && (
        <Alert variant="destructive" role="alert">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>Não foi possível consultar as contas do servidor de reuniões agora.</AlertDescription>
        </Alert>
      )}

      <UsersTable rows={rows} available={users !== null} />
    </div>
  );
}
