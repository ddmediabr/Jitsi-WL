import Link from "next/link";
import { redirect } from "next/navigation";
import { SmartphoneIcon } from "lucide-react";
import EnrollTwoFactor from "@/components/settings/EnrollTwoFactor";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/server/auth/dal";
import { getSetting } from "@/server/settings";

export default async function EnrollTwoFactorPage() {
  const admin = await requireSession();
  if (admin.twoFactorEnabled) redirect("/settings/security");
  const required = await getSetting("require_2fa");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 p-6">
      <ThemeToggle floating />
      <header className="flex items-center gap-4">
        <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
          <SmartphoneIcon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs leading-normal tracking-widest text-muted-foreground uppercase">
            {required ? "Obrigatório" : "Recomendado"}
          </p>
          <h1 className="text-xl leading-tight font-semibold">Ativar a verificação em duas etapas</h1>
        </div>
      </header>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {required
          ? `Olá, ${admin.name}. O painel exige a verificação em duas etapas: o acesso só é liberado depois de ativá-la.`
          : `Olá, ${admin.name}. Com a verificação em duas etapas, uma senha vazada não basta para entrar no painel. Você pode ativar agora ou deixar para depois.`}
      </p>
      <EnrollTwoFactor />
      {!required && (
        <Button variant="ghost" render={<Link href="/settings/security" />} className="w-fit">
          Agora não
        </Button>
      )}
    </main>
  );
}
