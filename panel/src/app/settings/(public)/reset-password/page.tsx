import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import ResetForm from "@/components/settings/ResetForm";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && token.length >= 10 && token.length <= 256;
  return (
    <AuthShell
      title="Nova senha"
      description={valid ? "Escolha uma nova senha (mínimo de 12 caracteres)." : "Este link é inválido. Peça um novo na tela de login."}
    >
      {valid ? <ResetForm token={token} /> : null}
      <p className="mt-5 text-center">
        <Link href="/settings/login" className="auth-link">
          Voltar ao login
        </Link>
      </p>
    </AuthShell>
  );
}
