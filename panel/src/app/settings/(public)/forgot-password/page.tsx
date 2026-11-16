import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import ForgotForm from "@/components/settings/ForgotForm";
import { getAdmin } from "@/server/auth/dal";
import { mailConfigured } from "@/server/auth/mail";

export default async function ForgotPasswordPage() {
  if (await getAdmin()) redirect("/settings");
  const canSend = mailConfigured();
  return (
    <AuthShell
      title="Esqueci minha senha"
      description={
        canSend
          ? "Digite o e-mail da conta. Enviaremos um link para criar uma nova senha."
          : "O envio de e-mail não está configurado. Peça ao proprietário para redefinir a sua senha."
      }
    >
      {canSend ? <ForgotForm /> : null}
      <p className="mt-5 text-center">
        <Link href="/settings/login" className="auth-link">
          Voltar ao login
        </Link>
      </p>
    </AuthShell>
  );
}
