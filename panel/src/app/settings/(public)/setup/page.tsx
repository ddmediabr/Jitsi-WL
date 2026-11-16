import { count } from "drizzle-orm";
import { notFound } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import SetupForm from "@/components/settings/SetupForm";
import { db } from "@/server/db";
import { user } from "@/server/db/auth-schema";
import { env } from "@/server/env";

export default async function SetupPage() {
  // A tela só existe enquanto não há nenhum administrador (depois disso: 404).
  const [{ n }] = await db().select({ n: count() }).from(user);
  if (n > 0) notFound();

  const hasToken = !!env().SETUP_TOKEN;
  return (
    <AuthShell
      title="Criar o administrador"
      description={
        hasToken
          ? "Use o token de configuração do Coolify. Esta tela some quando o primeiro administrador é criado."
          : "Defina SETUP_TOKEN (32+ caracteres) no Coolify e reinicie o painel."
      }
    >
      {hasToken ? <SetupForm /> : null}
    </AuthShell>
  );
}
