import { count } from "drizzle-orm";
import { redirect } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import LoginForm from "@/components/settings/LoginForm";
import { getAdmin } from "@/server/auth/dal";
import { db } from "@/server/db";
import { user } from "@/server/db/auth-schema";

export default async function SettingsLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ configurado?: string; senha?: string }>;
}) {
  // Já logado: vai para o painel. Sem nenhum administrador: configuração inicial.
  if (await getAdmin()) redirect("/settings");
  const [{ n }] = await db().select({ n: count() }).from(user);
  if (n === 0) redirect("/settings/setup");

  const { configurado, senha } = await searchParams;
  const notice = configurado
    ? "Administrador criado. Entre para ativar a verificação em duas etapas."
    : senha
      ? "Senha redefinida. Entre com a nova senha."
      : undefined;
  return (
    <AuthShell description="Faça login para acessar sua conta">
      <LoginForm notice={notice} />
    </AuthShell>
  );
}
