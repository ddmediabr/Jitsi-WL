import "server-only";
import { db } from "@/server/db";
import { jitsiProfiles } from "@/server/db/schema";

/** Nome de exibição: 2 a 60 caracteres, sem caracteres de controle. */
export function validateDisplayName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) return { ok: false, error: "O nome deve ter de 2 a 60 caracteres." };
  if (/\p{C}/u.test(name)) return { ok: false, error: "O nome não pode ter caracteres de controle." };
  // Sem marcação: as telas escapam o nome, mas ele também vai para e-mails, documentos e o prompt da IA.
  if (/[<>"`{}\\]/.test(name)) return { ok: false, error: "O nome não pode ter os caracteres < > \" ` { } \\." };
  return { ok: true, name };
}

/** usuário -> nome de exibição (contas sem nome cadastrado ficam de fora). */
export async function getProfileMap(): Promise<Map<string, string>> {
  const rows = await db().select({ u: jitsiProfiles.username, n: jitsiProfiles.displayName }).from(jitsiProfiles);
  // Conta sem nome definido guarda o próprio usuário como nome: nas listas aparece como "sem nome".
  return new Map(rows.filter((r) => r.n !== r.u).map((r) => [r.u, r.n]));
}
