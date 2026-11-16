import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSetting } from "@/server/settings";
import { auth } from "./index";
import { clientInfo } from "./request";

/** Só dois papéis: administrador (mexe em tudo, exceto contas do painel/Jitsi) e proprietário. */
export type Role = "owner" | "admin";
const RANK: Record<Role, number> = { admin: 1, owner: 2 };

export type AdminUser = {
  id: string;
  sessionId: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  twoFactorEnabled: boolean;
};

function toRole(value: unknown): Role | null {
  return value === "owner" || value === "admin" ? value : null;
}

/** Sessão atual (uma consulta por requisição). Null = sem sessão válida. */
export const getAdmin = cache(async (): Promise<AdminUser | null> => {
  const { headers } = await clientInfo();
  const session = await auth().api.getSession({ headers });
  if (!session) return null;
  const u = session.user as typeof session.user & {
    role?: string;
    username?: string | null;
    twoFactorEnabled?: boolean | null;
  };
  // Papel desconhecido (ex.: o antigo "viewer") = sem acesso: falha fechada.
  const role = toRole(u.role);
  if (!role) return null;
  return {
    id: u.id,
    sessionId: session.session.id,
    name: u.name,
    username: u.username ?? u.email,
    email: u.email,
    role,
    twoFactorEnabled: u.twoFactorEnabled === true,
  };
});

/** Exige sessão (mesmo sem 2FA configurado: usado só na tela de configuração do 2FA). */
export async function requireSession(): Promise<AdminUser> {
  const admin = await getAdmin();
  if (!admin) redirect("/settings/login");
  return admin;
}

/**
 * Exige sessão + papel mínimo (e 2FA ativo, quando a configuração `require_2fa` estiver ligada).
 * TODA página e ação do painel passa por aqui: o proxy só faz uma checagem otimista de cookie e
 * não é fronteira de segurança. O 2FA é recomendado e opcional por padrão; quem o ativa por conta
 * própria passa a ser cobrado no login de qualquer forma.
 */
export async function requireFullAuth(minRole: Role = "admin"): Promise<AdminUser> {
  const admin = await requireSession();
  if (!admin.twoFactorEnabled && (await getSetting("require_2fa"))) redirect("/settings/security/2fa");
  if (RANK[admin.role] < RANK[minRole]) redirect("/settings?negado=1");
  return admin;
}

export function hasRole(admin: AdminUser, minRole: Role): boolean {
  return RANK[admin.role] >= RANK[minRole];
}
