# Roteiro de instalação — para a LLM

Você vai instalar uma instância completa do produto num servidor com Coolify, usando o **MCP do Coolify**. O resultado
deve ser idêntico à instalação de referência. Leia antes [ARQUITETURA.md](ARQUITETURA.md) e
[SEGURANCA.md](SEGURANCA.md). O que cabe ao humano está em [INSTALACAO-HUMANA.md](INSTALACAO-HUMANA.md): peça cada item
no momento indicado.

## Regras de trabalho

1. **Uma fase por vez, e a checagem da fase precisa passar antes da próxima.** Se falhar, diagnostique (logs do Coolify,
   `get_deployment` com `include_log_summary`). Não siga em frente com uma fase quebrada.
2. **Segredos:**
   - nunca os escreva no chat, em commits, em descrições ou em comandos de tarefas agendadas;
   - eles saem de `build/secrets.env`, gerado por `tools/render_templates.py`;
   - leia o arquivo e envie o valor direto na chamada do MCP;
   - não reutilize segredos de outra instalação.
3. **Toda variável** gravada com `manage_env` usa `is_literal: true` (os valores têm `$`, aspas e espaços). Nas do app,
   use também `is_runtime: true`, `is_buildtime: false` e `is_preview: false`.
4. **Anote cada uuid** criado em `install.values` e rode `python tools/render_templates.py install.values` de novo. O
   script pula, com aviso, o que ainda depende de um uuid ausente, e nunca deixa marcador `{{...}}` sobrando.
5. **Não invente mudanças** no compose, nos módulos ou no código para fazer algo passar. Se a instalação de referência faz
   de um jeito, siga esse jeito. Se algo daqui não bater com o ambiente, pare e avise o humano.
6. **Comando dentro de contêiner** só por tarefa agendada (`manage_scheduled_task`). Ela roda como usuário comum, e o
   comando tem no máximo ~255 caracteres, sem `>` nem `&&` (use `;`, `|` ou `sh -c "..."`). Depois de usar, troque o
   comando para `true` e desligue a tarefa.
7. **`restart` não reaplica** compose, variáveis nem domínios. Use `manage_service update` com `instant_deploy: true`, ou
   `deploy`, no app.

## Fase 0 — Pré-requisitos e descoberta

1. `coolify_help` e `get_infrastructure_overview`: confirme que o token tem `read`, `read:sensitive`, `write` e `deploy`.
2. `list_servers`, depois `get_server` do servidor: anote o uuid, `server_metadata.arch`, `server_metadata.kernel` e
   `patch_check_result.kernels` (`running`, `boot`).
3. `manage_proxy get`: o proxy precisa ser `TRAEFIK`, rodando, e o comando precisa ter
   `--providers.file.directory=/traefik/dynamic/` e `--providers.file.watch=true`.
4. Peça ao humano os dados de INSTALACAO-HUMANA "ANTES — 7" que faltarem. Copie `install.values.example` para
   `install.values` e preencha `DOMAIN`, `PUBLIC_IP`, `TZ` e `BRAND_NAME`.
5. Rode `python tools/render_templates.py install.values`. Isso cria `build/secrets.env`.
6. Crie o projeto (`manage_project`), com o nome da marca e o ambiente `production`.

**Checagem:**
- o DNS do domínio resolve para `PUBLIC_IP` (`nslookup <domínio>`);
- `https://<domínio>` ainda dá 404 ou 503 do Traefik (nenhum recurso usa o domínio);
- `build/secrets.env` existe com 13 chaves.

## Fase 1 — Banco do painel

1. `create_database` com a ação `postgresql`:
   - `name: "<marca>-painel-db"` e `image: "postgres:17-alpine"`;
   - `postgres_user: "panel"`, `postgres_db: "panel"` e `postgres_password` = `DB_OWNER_PASSWORD` de
     `build/secrets.env`;
   - `is_public: false` e `instant_deploy: true`.
2. Anote o uuid em `DB_UUID`. Na rede do Coolify, o nome de host do banco é esse uuid.
3. **Backup:** `manage_backup create`:
   - `frequency: "0 3 * * *"` e `database_backup_retention_amount_locally: 14`;
   - com o S3 que o humano cadastrou (`manage_s3_storage list` para achar o uuid): `save_s3: true`, `s3_storage_uuid` e
     `database_backup_retention_amount_s3: 14`.

**Checagem:**
- o status é `running:healthy`;
- `manage_backup update` com `backup_now: true` e depois `list_backup_executions`: a última execução tem
  `status: success`;
- com S3, o `manage_s3_storage validate` dá `valid: true`.

## Fase 2 — Serviço do Jitsi

1. **Criar o serviço.** `create_service` com a ação `compose`:
   - `docker_compose_raw` = base64 de `build/jitsi/docker-compose.yml`;
   - `connect_to_docker_network: true`, porque o painel precisa alcançar `prosody-<uuid>`;
   - `name: "<marca>-jitsi"` e `instant_deploy: false`.

   Anote o uuid em `JITSI_SERVICE_UUID`.
2. `list_service_applications`: anote os uuids de `web` e `prosody`.
3. **Variáveis.** `manage_env bulk_update` com todas as linhas de `build/jitsi/jitsi.env`. As demais variáveis do
   compose ficam vazias.
4. **Domínio do `web`.** `manage_service update_application`:
   - `app_uuid` = o uuid do `web`;
   - `data: { "url": "https://<domínio>:8000" }`. O `:8000` é a porta do nginx interno, não uma porta pública.
5. **Módulos e segredo do Prosody.** Para CADA arquivo de `build/prosody/` (seis `.lua` e `ddmedia-admin.secret`):
   - `manage_storage create`, com `resource: service` e `uuid` = `JITSI_SERVICE_UUID`;
   - `data`: `type: "file"`, `resource_uuid` = o uuid do `prosody`, `mount_path: "/prosody-plugins-custom/<arquivo>"` e
     `content` = o conteúdo do arquivo.
6. **Subir.** `manage_service update` com `instant_deploy: true`.

**Checagem** (espere 1 a 2 min):
- `get_logs` do serviço: cada módulo registra `v... carregado em <host>`:
  - `admin_api` v1.11;
  - `focus_authz` v6.3;
  - `room_guard` v1.11;
  - `reconnect_pass` v1.2;
  - `recording_guard` v1.1;
  - `auth_limit` v1.

  O log do Coolify traz só as últimas 100 linhas e mascara o domínio. Se não aparecer, reinicie e leia logo depois.
- `curl -sI https://<domínio>/config.js` dá 200, com `content-security-policy: frame-ancestors 'self'`.
- `curl -s https://<domínio>/ddmedia-admin/status` NÃO responde da API: a rota não existe para fora.

## Fase 3 — Painel

1. **Criar o app.** `create_application`:
   - ação `public` (URL do repositório) ou `github_app` (com o `github_app_uuid` que o humano indicar);
   - `git_branch: "main"`, `build_pack: "dockerfile"`, `base_directory: "/panel"` e `ports_exposes: "3000"`;
   - `domains: "https://<domínio>/_flow-test"`. É o domínio técnico. Ele cria o serviço `https-0-<uuid>@docker` do
     Traefik. **Nunca o remova.**
   - `health_check_enabled: true`, `health_check_path: "/flow-api/health"` e `health_check_port: "3000"`;
   - `name: "<marca>-painel"` e `instant_deploy: false`.

   Anote o uuid em `PANEL_APP_UUID`.
2. **Volume das gravações.** `manage_storage create` com `resource: application`:
   `data: { "type": "persistent", "name": "recordings", "mount_path": "/data/recordings" }`.
3. **Variáveis.** Preencha `DB_UUID` e `JITSI_SERVICE_UUID` em `install.values`, rode o script e faça
   `manage_env bulk_update` com `build/panel/panel.env`. Ele inclui `SETUP_TOKEN` e `BRAND_NAME`. Os opcionais (Resend,
   Gemini) só entram se estiverem em `install.values`.
4. `deploy` do app. O build leva de 2 a 4 min.

**Checagem:**
- `get_deployment` dá `finished`;
- `get_logs` mostra `[painel] migrações do banco aplicadas`, sem `política não sincronizada` nem
  `Variáveis de ambiente inválidas`;
- `curl -s https://<domínio>/_flow-test/flow-api/health` dá 200.

## Fase 4 — Regras do Traefik (humano aplica)

1. Preencha `PANEL_APP_UUID`, rode o script e entregue ao humano o conteúdo de `build/traefik/jitsi-flow.yaml`
   (INSTALACAO-HUMANA, "DURANTE — 1"). O arquivo não tem segredo.
2. Espere a confirmação.

**Checagem:**
- `curl -s -H "Sec-Fetch-Dest: document" -H "Sec-Fetch-Mode: navigate" https://<domínio>/qualquer-sala` devolve HTML do
  painel (`<title>Entrar na sala | <marca>`);
- `https://<domínio>/settings/login` dá 200 e `https://<domínio>/config.js` continua sendo o Jitsi;
- 40 `POST https://<domínio>/flow-api/login` seguidos, com `Origin: https://<domínio>` e corpo `{}`: os primeiros dão
  400 e, a partir de ~13, 429.

## Fase 5 — Primeiro administrador

1. Entregue ao humano o `SETUP_TOKEN` de `build/secrets.env` por canal seguro, e só esse valor
   (INSTALACAO-HUMANA, "DURANTE — 2").
2. Quando ele confirmar a conta criada e o 2FA ativo: `list_env_keys` do app, depois `manage_env delete` da
   `SETUP_TOKEN` (inclusive a cópia `is_preview`, se existir), depois `deploy`.

**Checagem:**
- `https://<domínio>/settings/setup` dá 404;
- `SETUP_TOKEN` não aparece em `list_env_keys`.

## Fase 6 — Carregador do snd-aloop

1. **Adaptar o Dockerfile.** Ajuste `infra/snd-loopback/Dockerfile` ao kernel da Fase 0, seguindo
   `infra/snd-loopback/README.md`:
   - inclua `running` e `boot`, se forem diferentes;
   - confira o SHA256 no índice oficial por HTTPS;
   - mantenha a conferência de SHA256 no build.
2. **Criar o app.** `create_application` com a ação `dockerfile`:
   - `dockerfile` = base64 do arquivo e `ports_exposes: "80"`;
   - `name: "<marca>-snd-loopback"`, sem domínio e com `instant_deploy: false`.
3. **Opções de execução.** `manage_application update`:
   - `custom_docker_run_options: "--cap-drop=ALL --cap-add=SYS_MODULE --security-opt=no-new-privileges:true"`;
   - `health_check_enabled: false`.
4. `deploy`.

**Checagem:** o log mostra `snd-aloop CARREGADO` ou `snd-aloop ja estava carregado`, e não `NAO carregado`.

## Fase 7 — Gravador (Jibri)

O compose do gravador monta `/data/coolify/services/<uuid do próprio serviço>/src`. Crie primeiro, pegue o uuid e só
depois coloque o compose real.

1. **Criar com um compose provisório.** `create_service` com a ação `compose`:
   - `docker_compose_raw` = base64 de
     `services:\n  perms:\n    image: 'alpine:3.20'\n    restart: 'no'\n    command: ['true']\n`;
   - `connect_to_docker_network: false` (o compose real entra na rede do Jitsi pelo nome);
   - `name: "<marca>-jibri"` e `instant_deploy: false`.

   Anote o uuid em `JIBRI_SERVICE_UUID` e rode o script.
2. **Compose real.** `manage_service update` com `docker_compose_raw` = base64 de `build/jibri/docker-compose.yml`, sem
   deploy.
3. `list_service_applications`: anote os uuids de `perms` e `webproxy`.
4. **Arquivos.** `manage_storage create`, com `resource: service` e `uuid` = `JIBRI_SERVICE_UUID`:
   - `ddmedia-finalize.sh`: `resource_uuid` = `perms` e `mount_path: "/src/ddmedia-finalize.sh"`;
   - `ddmedia-web-proxy.conf`: `resource_uuid` = `webproxy` e `mount_path: "/src/ddmedia-web-proxy.conf"`.

   O conteúdo vem de `build/jibri/`. No servidor, os arquivos ficam em `/data/coolify/services/<uuid>/src/`, que é o
   caminho montado pelo compose.
5. **Variáveis.** `manage_env bulk_update` com `build/jibri/jibri.env`.
6. **Subir.** `manage_service update` com `instant_deploy: true`.
7. **Ligar o painel ao gravador.** Preencha também `COOLIFY_URL` e `COOLIFY_API_TOKEN` em `install.values`, se o humano
   entregou o token só deploy (INSTALACAO-HUMANA, "DURANTE — 3"). Rode o script e atualize no app do painel
   `COOLIFY_JIBRI_SERVICE_UUID`, `COOLIFY_URL` e `COOLIFY_API_TOKEN`. Depois, `deploy` do painel.

**Checagem** (espere ~1 min depois de subir):
- `perms` terminou com código 0;
- `jibri` e `webproxy` estão rodando;
- o log do Jibri não tem erro de login XMPP nem de dispositivo de som. Se houver erro de som, volte à Fase 6.

**Se mexer no gravador depois:** reinicie sempre o **serviço inteiro**. Reiniciar só o `jibri` deixa o `webproxy` no
namespace de rede antigo.

## Fase 8 — Teste de ponta a ponta

1. Peça ao humano a conta e a sala de teste (INSTALACAO-HUMANA, "DURANTE — 4").
2. Se houver Playwright disponível na sua máquina, automatize. Senão, guie o humano.
3. Teste:
   - o convidado cai na sala de espera e o moderador aprova;
   - o moderador entra pela tela de login e continua moderador ao recarregar;
   - gravar 1 a 2 min, que aparece em Gravações;
   - com Resend: o e-mail chega;
   - com Gemini e "Transcrever ao final" ligado: a transcrição fica "Pronto" e o e-mail chega com os anexos.

**Checagem:** todos os itens passaram. Mídia sem áudio ou vídeo entre redes diferentes indica UDP 10000 fechado ou
`JVB_ADVERTISE_IPS` errado.

## Fase 9 — Verificação de segurança

1. Rode toda a seção "Verificação de cada instalação" de [SEGURANCA.md](SEGURANCA.md).
2. Teste as portas TCP de fora (por exemplo, `curl --connect-timeout 5 http://<ip>:8000`, que deve falhar).

**Checagem:** todos os itens marcados. Qualquer falha volta à fase responsável.

## Fase 10 — Entrega

1. **Tarefas agendadas:** nenhuma ativa. As usadas ficam com o comando `true` e desligadas (`list_scheduled_tasks` em
   cada recurso).
2. **Backup:** recomende ao humano o backup do volume `prosody-storage` (contas do Jitsi), com
   `manage_storage set_backup` e S3 (OPERACAO.md). Agende se ele autorizar.
3. **Relatório ao humano:**
   - os uuids dos recursos;
   - o que foi testado;
   - o que ficou desligado (sem Resend, Gemini ou token do gravador);
   - os itens de "DEPOIS" de INSTALACAO-HUMANA.
4. **`build/secrets.env`:** entregue por canal seguro, ou apague, conforme o humano decidir. Apague `install.values` e
   `build/` da sua máquina ao final.

## Pegadinhas conhecidas (ambiente Coolify)

- **`xmpp.meet.jitsi` não resolve** no Coolify. Por isso `XMPP_SERVER=prosody` e `XMPP_BOSH_URL_BASE=http://prosody:5280`.
- **`XMPP_HIDDEN_DOMAIN` igual a `recorder.meet.jitsi`.** Sem ele, o Prosody cria `hidden.meet.jitsi`, que não bate com a
  configuração do Jitsi, e o gravador não entra.
- **Senha interna trocada não tem efeito:** o Prosody cria as contas internas (jibri, recorder, focus, jvb) na primeira
  subida, e trocar a senha depois não atualiza a conta. Apague a conta com
  `prosodyctl --config /run/prosody/config/prosody.cfg.lua shell user delete <conta>@auth.meet.jitsi` (tarefa agendada no
  contêiner `prosody`) e faça o redeploy.
- **O Chrome do Jibri não pode abrir `https://<domínio>`**, porque o Traefik manda a navegação ao painel, e `http://web:8000`
  é um contexto inseguro (sem WebRTC). Por isso o `webproxy` em `localhost:8000`.
- **Nomes na rede `coolify`:** o host do banco é o uuid dele, e o Prosody é `prosody-<uuid do serviço do Jitsi>`.
- **Ler um file storage:** os file storages não aparecem em `list_storages`. Para ler um arquivo, chame
  `manage_storage update` com só `uuid`, `type` e `mount_path`: a resposta devolve o conteúdo.
- **Arquivo novo** em `/prosody-plugins-custom/` aparece ao vivo. Em outros contêineres, só se o compose montar a pasta.
- **Coolify ignora `--pid=host`** nas opções de execução. Use só as opções listadas aqui.
