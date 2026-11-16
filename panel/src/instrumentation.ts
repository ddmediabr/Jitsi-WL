// Roda uma vez quando o servidor inicia (runtime Node):
//  1. aplica as migrações do banco;
//  2. envia a política ao Prosody e repete a cada minuto (se o Prosody reiniciar ou perder a
//     política, o painel a reenvia sozinho; a última política válida fica guardada no Prosody).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.DATABASE_ADMIN_URL) {
    const { runMigrations } = await import("@/server/db/migrate");
    await runMigrations();
    console.info("[painel] migrações do banco aplicadas");
  }

  const globalFlag = globalThis as unknown as { __ddSyncTimer?: NodeJS.Timeout };
  if (process.env.PROSODY_ADMIN_URL && !globalFlag.__ddSyncTimer) {
    const { syncPolicy } = await import("@/server/prosody/sync");
    const run = () =>
      syncPolicy()
        .then((s) => {
          if (!s.ok) console.warn("[painel] política não sincronizada:", s.error);
        })
        .catch((e) => console.error("[painel] erro na sincronização da política", e instanceof Error ? e.message : e));
    void run();
    globalFlag.__ddSyncTimer = setInterval(run, 60_000);
    globalFlag.__ddSyncTimer.unref();
  }

  // Salas temporárias: a cada minuto confere quais venceram ou ficaram vazias tempo demais e apaga.
  const sweepFlag = globalThis as unknown as { __ddSweepTimer?: NodeJS.Timeout };
  if (process.env.PROSODY_ADMIN_URL && process.env.DATABASE_URL && !sweepFlag.__ddSweepTimer) {
    const { sweepTemporaryRooms } = await import("@/server/rooms/sweeper");
    const run = () =>
      sweepTemporaryRooms().catch((e) => console.error("[painel] erro ao varrer salas temporárias", e instanceof Error ? e.message : e));
    setTimeout(run, 20_000).unref(); // espera o Prosody e a política subirem
    sweepFlag.__ddSweepTimer = setInterval(run, 60_000);
    sweepFlag.__ddSweepTimer.unref();
  }

  // Auditoria: uma vez por dia apaga o que passou da retenção (12 meses), só pela função do banco.
  const auditFlag = globalThis as unknown as { __ddAuditTimer?: NodeJS.Timeout };
  if (process.env.DATABASE_URL && !auditFlag.__ddAuditTimer) {
    const { purgeOldAudit } = await import("@/server/auth/audit-retention");
    const run = () =>
      purgeOldAudit()
        .then((n) => {
          if (n > 0) console.info(`[painel] auditoria: ${n} registro(s) antigo(s) removido(s)`);
        })
        .catch((e) => console.error("[painel] erro na limpeza da auditoria", e instanceof Error ? e.message : e));
    setTimeout(run, 5 * 60_000).unref();
    auditFlag.__ddAuditTimer = setInterval(run, 24 * 60 * 60_000);
    auditFlag.__ddAuditTimer.unref();
  }

  // Transcrição (IA): o que ficou "processando" volta para a fila e o trabalhador confere a fila a cada 2 minutos.
  const trFlag = globalThis as unknown as { __ddTrTimer?: NodeJS.Timeout };
  if (process.env.DATABASE_URL && process.env.GEMINI_API_KEY && !trFlag.__ddTrTimer) {
    const { recoverStuck, kickWorker } = await import("@/server/transcription/queue");
    void recoverStuck().then(kickWorker).catch((e) => console.error("[painel] erro ao retomar a fila de transcrição", e instanceof Error ? e.message : e));
    trFlag.__ddTrTimer = setInterval(kickWorker, 120_000);
    trFlag.__ddTrTimer.unref();
  }

  // Gravações: uma vez por dia, às 4h (no fuso escolhido nas configurações), apaga o que passou da retenção ou do limite de espaço.
  // Entregas novas e mudanças nos limites já disparam a limpeza por conta própria.
  const recFlag = globalThis as unknown as { __ddRecPurgeTimer?: NodeJS.Timeout };
  if (process.env.DATABASE_URL && !recFlag.__ddRecPurgeTimer) {
    const { purgeAll } = await import("@/server/recordings/purge");
    const run = () => purgeAll().catch((e) => console.error("[painel] erro na limpeza das gravações", e instanceof Error ? e.message : e));
    const schedule = async () => {
      const { getTimeZone } = await import("@/server/timezone");
      const { msUntilLocalHour } = await import("@/lib/tz");
      const wait = msUntilLocalHour(4, await getTimeZone().catch(() => "America/Sao_Paulo"));
      recFlag.__ddRecPurgeTimer = setTimeout(() => {
        void run();
        void schedule();
      }, wait);
      recFlag.__ddRecPurgeTimer.unref();
    };
    void schedule();
  }
}
