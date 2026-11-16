import { bigint, bigserial, boolean, customType, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Coluna binária (bytea) que entrega e recebe Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Trilha de auditoria (RULES §10, STRIDE "Repudiation"): só se acrescenta. O usuário do aplicativo
 * não tem UPDATE/DELETE (privilégios + RLS, ver migrate.ts), então nem uma falha de injeção apaga
 * o histórico.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** Quem fez (id do administrador) ou null para ações do sistema/anônimas. */
    actorId: text("actor_id"),
    actorLabel: text("actor_label"),
    /** Ex.: "auth.login.success", "room.create". */
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    details: jsonb("details"),
  },
  (t) => [index("audit_log_at_idx").on(t.at), index("audit_log_action_idx").on(t.action)],
);

/**
 * Limitador de tentativas (anti-força-bruta). Uma linha por chave (`ip:<ip>`, `user:<usuário>`).
 * As server actions do painel não passam pelo limitador de requisições da Better Auth (ele só
 * vale para o handler HTTP), então o controle é nosso e fica no banco: sobrevive a reinícios.
 */
export const authThrottle = pgTable("auth_throttle", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

/**
 * Configurações do painel (chave -> valor JSON). Hoje: `require_2fa` (booleano). Entram aqui, nas
 * próximas ondas, os prazos do passe de reconexão e da retomada de sessão (editáveis no painel).
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by"),
});

/**
 * Salas permanentes (Onda 2). O painel é a fonte da verdade: a política enviada ao Prosody é
 * gerada a partir daqui. Uma sala fora desta tabela não abre para ninguém.
 */
export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Nome na URL (/<nome>): minúsculas, números, hífen e sublinhado. */
  name: text("name").notNull().unique(),
  kind: text("kind").notNull().default("permanent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** Sala exclusiva: só quem está na lista de acesso entra; os demais são barrados (sem sala de espera). */
  exclusive: boolean("exclusive").notNull().default(false),
  /** Lobby (sala de espera) de entrada: ligado, quem não tem acesso livre espera a aprovação de um moderador/usuário com privilégios. */
  lobby: boolean("lobby").notNull().default(true),
  /** "Sala com senha": convidados podem entrar com a senha vigente (gerada e trocada a cada 10 min pelo Prosody), sem aprovação. */
  password: boolean("password").notNull().default(false),
  /** Prazo de existência (só salas temporárias): depois dele a sala é apagada e o endereço deixa de levar a qualquer lugar. Reunião em andamento não é cortada: a sala some quando ela acaba. */
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  /** Texto do cartão da sala na página de entrada (vazio: texto padrão pelo tipo de acesso). */
  description: text("description"),
  /** Ícone do cartão (chave de lib/hall; vazio: o padrão pelo tipo de acesso). */
  icon: text("icon"),
});

/**
 * Acesso das contas Jitsi (usuário do Prosody, em minúsculas) a cada sala. Quem não está aqui cai na
 * sala de espera como convidado (ou é barrado, se a sala for exclusiva). A tabela mantém o nome
 * antigo `room_moderators` no banco.
 */
export const roomAccess = pgTable(
  "room_moderators",
  {
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    /** "moderator" (entra livre, com privilégios) ou "member" (usuário comum: entra livre, sem privilégios). */
    role: text("role").notNull().default("moderator"),
    /** Só vale para "member": pode iniciar a reunião sozinho (sem moderador), sem privilégios de moderação. */
    canStart: boolean("can_start").notNull().default(false),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    addedBy: text("added_by"),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.username] })],
);


/**
 * Nome de exibição das contas Jitsi (a conta em si vive no servidor de reuniões, que só guarda usuário e
 * hash da senha). O painel é a fonte do nome: vira "Nome [usuário]" nas listas e, na Onda 6, o nome
 * travado de quem entra com a conta.
 */
export const jitsiProfiles = pgTable("jitsi_profiles", {
  username: text("username").primaryKey(),
  displayName: text("display_name").notNull(),
  /** Trocas feitas PELO PRÓPRIO usuário (a política 3 livres / 15 dias / 30 dias conta daqui); trocas do painel não contam. */
  nameChanges: integer("name_changes").notNull().default(0),
  nameChangedAt: timestamp("name_changed_at", { withTimezone: true }),
  photoChanges: integer("photo_changes").notNull().default(0),
  photoChangedAt: timestamp("photo_changed_at", { withTimezone: true }),
  /** 0 = sem foto; aumenta a cada foto nova (vai na URL, para o navegador não usar a antiga em cache). */
  photoVersion: integer("photo_version").notNull().default(0),
  /** Modo invisível: a conta pode escolher entrar invisível nas salas em que é moderador (real). */
  invisibleAllowed: boolean("invisible_allowed").notNull().default(false),
  /** E-mail opcional da conta: recebe o link de download das gravações que ela iniciou. Sem e-mail, só o painel baixa. */
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Foto de perfil já reprocessada (WebP 256x256, sem metadados). Uma linha por conta: a foto nova SUBSTITUI a antiga. */
export const jitsiPhotos = pgTable("jitsi_photos", {
  username: text("username").primaryKey(),
  data: bytea("data").notNull(),
  mime: text("mime").notNull().default("image/webp"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Identidade visual do painel (white label): logo e favicon já reprocessados. Uma linha por tipo; o novo SUBSTITUI o antigo. */
export const brandAssets = pgTable("brand_assets", {
  kind: text("kind").primaryKey(), // "logo" | "favicon"
  data: bytea("data").notNull(),
  mime: text("mime").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Gravações de reunião (Onda 10): o Jibri entrega cada arquivo ao painel ao terminar (ver /flow-api/recordings/ingest).
 * O arquivo fica no volume do painel, com o nome `<id>.mp4`; esta tabela guarda só os dados.
 */
export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Sala (nome na URL). */
    room: text("room").notNull(),
    /** Sessão do Jibri (uma por gravação): evita entregar o mesmo arquivo duas vezes. */
    sessionId: text("session_id").notNull().unique(),
    /** Nome original do arquivo gerado pelo Jibri (só para exibir). */
    fileName: text("file_name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    durationSeconds: integer("duration_seconds"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    /** Conta Jitsi (moderador) que iniciou a gravação, quando conhecida. */
    initiator: text("initiator"),
    /** Resolução real do arquivo ("1600x900"), medida pelo gravador na entrega. */
    resolution: text("resolution"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recordings_room_started_idx").on(t.room, t.startedAt)],
);

/** Quem clicou em "Gravar reunião" (a página avisa o painel ao iniciar): o Jibri não repassa isso, então a entrega casa pelo horário. */
export const recordingStarts = pgTable(
  "recording_starts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    room: text("room").notNull(),
    username: text("username").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** O moderador marcou "Transcrever ao final" ao iniciar. */
    transcribe: boolean("transcribe").notNull().default(false),
  },
  (t) => [index("recording_starts_room_at_idx").on(t.room, t.at)],
);

/**
 * Transcrição e análise de uma gravação feitas por IA (Onda 11). Cada linha é UMA execução (automática, ou pedida à mão pelo painel
 * com o modo Automático ou um modelo específico). Apagar a gravação apaga as execuções.
 */
export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordingId: uuid("recording_id")
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    /** null = cascata normal; senão, só este modelo. */
    requestedModel: text("requested_model"),
    /** queued | processing | waiting (nova tentativa agendada) | done | failed */
    status: text("status").notNull().default("queued"),
    /** Rodadas já executadas (cada rodada = uma passada completa pelo failover; no máximo 3, com 1 h de intervalo). */
    round: integer("round").notNull().default(0),
    /** Quando a próxima rodada deve rodar (status "waiting"). */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    /** Ao terminar (pronta ou definitivamente falha), envia o e-mail da gravação (com a transcrição, se houver). */
    notifyEmail: boolean("notify_email").notNull().default(false),
    modelTranscribe: text("model_transcribe"),
    modelAnalyze: text("model_analyze"),
    /** Cada tentativa feita: { etapa, modelo, tentativa, ok, erro?, ms }. */
    attempts: jsonb("attempts").notNull().default([]),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    error: text("error"),
    transcript: jsonb("transcript"),
    analysis: jsonb("analysis"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("transcripts_recording_idx").on(t.recordingId, t.createdAt)],
);
