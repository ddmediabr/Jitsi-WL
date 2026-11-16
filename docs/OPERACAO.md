# Operação (depois de instalado)

## Atualizar o painel

O app do painel acompanha o branch do repositório no Coolify. Um push no branch dispara o deploy pelo webhook, ou rode
`deploy` pelo MCP. As migrações rodam sozinhas no início. O log mostra `[painel] migrações do banco aplicadas`. Se uma
migração falhar, o painel não sobe e o Coolify mantém a versão anterior no ar.

**Migração nova:** crie o arquivo `.sql` em `panel/drizzle/` e a entrada em `panel/drizzle/meta/_journal.json`, com o
próximo `idx` e um `when` maior que o último. Nunca edite uma migração já aplicada em produção esperando que ela rode de
novo: o migrador decide pela data registrada.

## Atualizar o Jitsi ou o Jibri

As imagens estão fixadas em `stable-11248-3`, a mesma tag para `web`, `prosody`, `jicofo`, `jvb` e `jibri`. Para trocar:
1. Faça antes num ambiente de teste.
2. Atualize `JITSI_IMAGE_VERSION` e a imagem do Jibri.
3. Rode `manage_service update` com `instant_deploy`.
4. **Reteste o fluxo da sala.** O painel lê partes internas do Jitsi (ARQUITETURA.md, "Dependências do Jitsi").
   Repita a "Verificação de cada instalação" de SEGURANCA.md.

## Módulos do Prosody

Veja `infra/prosody/README.md`:
- leia o arquivo do servidor antes de editar;
- envie a versão de `build/prosody/`;
- recarregue ao vivo pela tarefa agendada e volte o comando para `true`.

## Kernel do servidor mudou (gravação parou)

O loader mostra `ATENCAO: kernel ... sem modulos nesta imagem`. Para corrigir:
1. Acrescente o kernel novo no Dockerfile do loader (`infra/snd-loopback/README.md`).
2. Faça o redeploy do loader.
3. **Reinicie o serviço do gravador inteiro.** Depois de um redeploy do Jibri, espere ~1 min antes de gravar: o status
   fica "starting".

Atualizações do sistema que trocam o kernel só valem depois de reiniciar o servidor. Antes de reiniciar, já inclua o
kernel de boot no loader. `get_server` mostra `kernels.running` e `kernels.boot`.

## Qualidade da gravação

- **Onde configurar:** Configurações > Sala (Live) > Qualidade da gravação (proprietário). As opções são 480p, 720p, 900p (padrão) e 1080p. 1080p
  só com "gravador em servidor dedicado".
- **Quando vale:** o Jibri lê a resolução ao iniciar. O botão "Aplicar agora" reinicia o gravador pelo token do Coolify
  (`COOLIFY_API_TOKEN`). Sem o token, reinicie o serviço do gravador pelo Coolify.
- **Tamanho medido:** 900p ≈ 0,63 GB/h e 720p ≈ 0,27 GB/h.
- **CPU:** uma gravação 720p usa ~0,8 núcleo.

## Backups

- **Banco do painel:** backup agendado do Coolify, diário às 03:00 UTC, com 14 cópias no servidor e 14 no S3.
  - Teste o envio com `manage_backup update` com `backup_now: true` e confira o arquivo no bucket.
  - No bucket, os dumps ficam em `data/coolify/backups/databases/...`. O caminho é fixo do Coolify, sem opção de prefixo.
    Para isolar, use um bucket só para isso.
- **Contas do Jitsi (senhas):** ficam no volume `prosody-storage` do serviço do Jitsi, e não no banco. A instalação de
  referência ainda não faz backup desse volume. Recomendado: agendar o backup de volume do Coolify
  (`manage_storage set_backup` no storage `prosody-storage`, com S3). Sem ele, perder o servidor exige recriar as contas
  pelo painel.
- **Fora do backup:**
  - as gravações (volume `/data/recordings` do painel), que vão por e-mail ou download e podem ser apagadas pela
    retenção;
  - o estado em memória do Prosody;
  - os volumes do Jitsi. Esses são recriados pelo compose e pelas variáveis; a política de salas é reenviada pelo
    painel.
- **Restaurar:** use `manage_database` / import do Coolify a partir do S3, num banco novo ou no mesmo, com o painel
  parado. Depois inicie o painel. Ele roda as migrações e reenvia a política ao Prosody na inicialização e a cada minuto
  (`src/instrumentation.ts`). As contas do Jitsi (senhas) vivem no Prosody, não no banco: restaurar o banco não as
  recria. Teste a restauração pelo menos uma vez por instalação.

## Ferramentas de emergência (dentro do contêiner do painel)

Rode por uma tarefa agendada do app do painel. Depois de usar, troque o comando para `true` e desligue a tarefa.

| Comando | Para quê |
|---|---|
| `node scripts/verify-db.mjs` | Confere que o usuário `panel_app` NÃO consegue o que não deve (DDL, apagar auditoria etc.) |
| `node scripts/audit-tail.mjs 30` | Últimos eventos da auditoria, só leitura |
| `sh -c "CONFIRM_RESET=yes node scripts/reset-admin.mjs"` | **Break-glass:** apaga TODOS os administradores, sessões e 2FA para `/settings/setup` voltar. A auditoria fica e registra o reset. Precisa de um `SETUP_TOKEN` novo depois |

## Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Painel fora do ar e Jitsi no ar | O domínio `/_flow-test` do painel foi removido, ou o deploy do painel falhou | Recoloque o domínio. Veja o deploy e o log |
| Sala abre a tela nativa do Jitsi | O `jitsi-flow.yaml` não está no proxy ou tem erro | Confira Servers > Proxy > Dynamic Configurations |
| "Servidor de reuniões indisponível" no login da sala | O painel não alcança `prosody-<uuid>:5280`, ou os segredos da API diferem | Confira `PROSODY_ADMIN_URL` e se `ddmedia-admin.secret` é igual a `PROSODY_ADMIN_SECRET` |
| Gravar não inicia (aviso após 8 s) | `snd-aloop` não carregado, Jibri parado ou senhas do Jibri diferentes nos dois serviços | Log do loader e do Jibri. As senhas `JIBRI_*` devem ser iguais |
| Gravação não aparece no painel | A entrega falhou: a pasta fica no Jibri com `ENTREGA_FALHOU` | Confira `DDMEDIA_INGEST_URL` e `DDMEDIA_INGEST_SECRET` igual a `RECORDING_INGEST_SECRET` |
| Jibri "FailedToJoinCall" depois de reiniciar só o `jibri` | O `webproxy` ficou no namespace de rede antigo | Reinicie o serviço do gravador inteiro |
| Senha do Jibri ou do Jicofo trocada e nada conecta | O Prosody não atualiza a conta existente | Apague a conta pelo `prosodyctl` e faça o redeploy (`infra/prosody/README.md`) |
| E-mails não saem | `RESEND_API_KEY` ou `MAIL_FROM` ausente, ou domínio não verificado no Resend | Verifique o domínio no Resend. `MAIL_FROM` precisa ser desse domínio |
