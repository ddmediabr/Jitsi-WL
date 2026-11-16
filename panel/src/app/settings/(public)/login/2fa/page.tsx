import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import TwoFactorForm from "@/components/settings/TwoFactorForm";
import { mailConfigured } from "@/server/auth/mail";
import { readPendingUser } from "@/server/auth/pending";

export default async function TwoFactorPage() {
  // Só chega aqui quem acabou de acertar a senha (cookie de "login em andamento").
  if (!(await readPendingUser())) redirect("/settings/login");
  return (
    <AuthShell title="Verificação em duas etapas" description="Digite o código do seu aplicativo autenticador.">
      <TwoFactorForm emailAvailable={mailConfigured()} />
    </AuthShell>
  );
}
