import "server-only";
import { z } from "zod";

/**
 * Variáveis de ambiente do painel, validadas na primeira leitura (não no build).
 * Segredos vivem só no Coolify (RULES §10): nada aqui tem valor padrão sensível.
 */
const schema = z.object({
  /** Banco, com o usuário de MENOR privilégio (`panel_app`): usado em toda requisição. */
  DATABASE_URL: z.string().min(1),
  /** Banco, com o dono: usado só nas migrações, na inicialização. */
  DATABASE_ADMIN_URL: z.string().min(1).optional(),
  /** Senha do usuário `panel_app` (definida pelas migrações). */
  APP_DB_PASSWORD: z.string().min(24).optional(),
  /** Segredo do Better Auth (assinatura de cookies/tokens). */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** URL pública do painel. */
  BETTER_AUTH_URL: z.string().url(),
  /** Token de uso único da tela /settings/setup (primeiro administrador). */
  SETUP_TOKEN: z.string().min(32).optional(),
  /** Resend (opcional): sem a chave e o remetente, "esqueci minha senha" e o código por e-mail ficam indisponíveis. */
  RESEND_API_KEY: z.string().min(10).optional(),
  /** Remetente de um domínio verificado no Resend, ex.: "Minha Empresa <no-reply@minhaempresa.com.br>". */
  MAIL_FROM: z.string().min(3).optional(),
  /** Segredo com que o gravador (Jibri) entrega os arquivos ao painel. Sem ele a entrega fica desligada (503). */
  RECORDING_INGEST_SECRET: z.string().min(32).optional(),
  /**
   * Reiniciar o gravador (Jibri) pelo painel, via API do Coolify (opcional; sem o token o recurso fica desligado).
   * O token deve ter SÓ a permissão "deploy". Endereço interno do Coolify na rede do Docker; só o serviço abaixo é reiniciado.
   */
  COOLIFY_URL: z.string().url().default("http://coolify:8080"),
  COOLIFY_API_TOKEN: z.string().min(20).optional(),
  COOLIFY_JIBRI_SERVICE_UUID: z.string().regex(/^[a-z0-9]{20,30}$/).optional(),
  /** Chave do Gemini (projeto com faturamento) para transcrever e resumir as gravações. Sem ela a transcrição fica desligada. */
  GEMINI_API_KEY: z.string().min(20).optional(),
  /** Nome padrão da marca (lido em server/settings.ts como BRAND_DEFAULT; sem ela, "Meet"). */
  BRAND_NAME: z.string().max(40).optional(),
  /** Pasta (volume persistente) onde ficam as gravações. */
  RECORDINGS_DIR: z.string().min(1).default("/data/recordings"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Só os NOMES dos campos com problema: nunca os valores.
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Variáveis de ambiente inválidas ou ausentes: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}
