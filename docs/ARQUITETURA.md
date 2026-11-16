# Arquitetura

Servidor de reuniões white label: o Jitsi Meet (auto-hospedado) mais um **painel próprio** que cuida da entrada nas salas,
da administração (`/settings`), da gravação, da transcrição e da identidade visual de cada cliente. Uma instalação =
um domínio, um servidor e um cliente. Tudo roda em contêineres no **Coolify**, atrás do **Traefik** que o Coolify gerencia.

## Componentes (recursos no Coolify)

| Recurso | Tipo no Coolify | O que é |
|---|---|---|
| Banco do painel | Banco PostgreSQL 17 (`postgres:17-alpine`), sem porta pública | Contas do painel, salas, perfis, auditoria, gravações, transcrições, configurações |
| Jitsi | Serviço (Docker Compose) com `web`, `prosody`, `jicofo`, `jvb` | O servidor de reuniões (`infra/jitsi`). O Prosody leva os módulos do produto (`infra/prosody`) |
| Painel | Aplicação (Dockerfile, pasta `panel/`), porta 3000 | Next.js 16: telas de entrada, painel `/settings`, API `/flow-api/*`, fila de transcrição |
| Carregador snd-aloop | Aplicação (Dockerfile colado) | Carrega a placa de som virtual no kernel, exigida pelo gravador (`infra/snd-loopback`) |
| Gravador | Serviço (Docker Compose) com `perms`, `jibri`, `webproxy` | Jibri: grava a sala num Chrome e entrega o MP4 ao painel (`infra/jibri`) |
| Regras do Traefik | Dynamic Configuration do proxy (`jitsi-flow.yaml`) | Divide o domínio entre o painel e o Jitsi e aplica os limites de requisição (`infra/traefik`) |

Serviços externos (opcionais): Resend (e-mail), Google Gemini (transcrição), armazenamento S3 (backup do banco).

## Um domínio, dois aplicativos

O Jitsi e o painel respondem no MESMO domínio, e o Traefik decide quem atende:

| Pedido | Vai para | Regra |
|---|---|---|
| `/_next/*`, `/_flow/*`, `/flow-api/*`, `/settings/*` | painel | `jitsi-flow-reserved` (prioridade 5000); `/flow-api` e `/settings` também passam por `jitsi-flow-api` (5050, limite 300/min por IP) e `jitsi-flow-auth` (5100, `/flow-api/login` e `/flow-api/closed`, 20/min) |
| Navegação de página inteira para `/` ou `/<sala>` (`Sec-Fetch-Dest: document` e `Sec-Fetch-Mode: navigate`, caminho sem `/` nem `.`) | painel | `jitsi-flow-document` (5001) |
| Todo o resto (o iframe do Jitsi, `/config.js`, `/libs/*`, `/xmpp-websocket`, `/http-bind`, ...) | `web` do Jitsi | rota criada pelo Coolify a partir do domínio `https://<domínio>:8000` do contêiner `web` |

**O que isso implica:**
- O painel só recebe navegações de **documento**. Dentro do painel, a troca de página é por `<a href>` ou
  `window.location`. `<Link>` e `router.push` do Next fazem `fetch`, que iria parar no Jitsi.
- O painel embute o Jitsi num iframe da **mesma origem**. Por isso ele lê o estado interno do Jitsi (`APP.store`) e
  controla a interface (veja "Dependências do Jitsi").
- O app do painel tem no Coolify o domínio técnico `https://<domínio>/_flow-test`. É isso que cria o serviço
  `https-0-<uuid do painel>@docker` usado pelas regras acima. **Não remova esse domínio.**

## Quem decide o quê

**O painel é só a experiência de uso. As regras de acesso vivem no Prosody** e valem também se alguém abrir a tela
nativa do Jitsi ou conectar por XMPP direto.

- **Política** (salas, papéis, sala exclusiva, sala de espera, senha, prazos): o painel guarda no banco e envia ao Prosody
  pela API interna assinada (`mod_ddmedia_admin_api`, `POST /policy`). Sem política válida, o Prosody nega tudo.
- **Login do cadastrado:** a tela é do painel (`/flow-api/login`). O painel confere a senha no Prosody
  (`POST /session/grant`) e liga o segredo do navegador (cookie HttpOnly `__Host-ddpass`) à conta. Depois disso, o
  Prosody decide sozinho, no pedido de conferência, se a pessoa é moderadora, usuária comum ou convidada (`focus_authz`).
- **Entrada na sala:** `room_guard` impõe a sala de espera, a sala exclusiva, a reunião fechada, a senha de sala, o nome e
  a foto das contas. Contas não entram no MUC pela conexão autenticada.
- **Gravação:** só moderador real inicia (`recording_guard`). O Jibri grava e entrega ao painel.

## Modelo de acesso

- **Pessoas na sala:**
  - *moderador*: tem conta e está na lista de moderadores da sala;
  - *usuário comum*: tem conta e está na lista de membros, entra direto, sem privilégios;
  - *convidado*: sem conta ou fora da lista, cai na sala de espera.
- **Sala exclusiva:** só entra quem está nas listas. Os outros são recusados, sem sala de espera.
- **Sala de espera:** ligada por padrão. A opção "lobby" da sala pode desligá-la, e o moderador não a desliga por dentro.
- **Reunião fechada:** interruptor do moderador. Até os membros precisam de aprovação. Some quando a reunião acaba.
- **Moderador interino:** um usuário comum marcado "pode iniciar". Vira moderador temporário quando não há moderador
  real, e é rebaixado quando um real entra.
- **Ninguém promove ninguém dentro da sala.** Papéis só mudam no painel.
- **Sala com senha:** opção da sala. Durante a reunião, o Prosody gera uma senha de 8 caracteres, trocada a cada 10 min.
  Só o moderador a vê. O convidado que a digita entra direto, com uso único em 90 s.
- **Modo invisível:** opção por conta, só para moderador real. Ninguém vê a presença dele, e ele continua moderando.
- **Passe de reconexão:** quem saiu volta sem nova aprovação até `reconnect_pass_seconds` (padrão 900 s).
- **Retomada de sessão:** o navegador do cadastrado fica lembrado por `remember_seconds` (padrão 24 h).
- **Salas temporárias:** prazo de 1 h a 30 dias. Vencido o prazo, a sala é apagada pelo varredor do painel (60 s).
  Uma reunião em andamento nunca é cortada.
- **Painel:** papéis *proprietário* e *administrador*. O administrador acessa tudo, menos "Usuários do painel" e as
  configurações de proprietário. Qualquer outro papel não tem acesso (falha fechada).

## Gravação e transcrição

1. O moderador real clica em Gravar. O painel registra o início (`/flow-api/recording-start`) e o Jicofo aciona o Jibri.
2. O Jibri abre a sala em `http://localhost:8000`, que é o `webproxy` (nginx). Ele repassa ao `web` do Jitsi e troca a
   marca d'água pelo logo da marca (`/flow-api/recording-logo`).
3. No fim, `ddmedia-finalize.sh` envia o MP4 a `POST /flow-api/recordings/ingest` (segredo compartilhado). O painel grava
   o arquivo no volume `/data/recordings`.
4. **"Transcrever ao final"** ligado no momento em que a gravação termina: o arquivo entra na fila (Gemini). O e-mail ao
   iniciador sai depois da transcrição, com `.txt` e `.docx` anexos. Desligado: o e-mail sai na hora, com o link
   assinado de 24 h. Detalhes em [TRANSCRICAO.md](TRANSCRICAO.md).
5. **Retenção:** padrão de 30 dias e teto de 35 GB. A limpeza começa 5 GB antes do teto e apaga as mais antigas. Uma
   gravação nunca é recusada.

O gravador faz **uma gravação por vez** (uma instância do Jibri). Mais gravações simultâneas exigem mais instâncias, cada
uma com o seu dispositivo `snd-aloop`.

## Banco

- **Migrações:** em `panel/drizzle/`. Rodam sozinhas a cada início do painel, com o usuário dono (`DATABASE_ADMIN_URL`).
- **Usuário de execução:** as migrações também criam e atualizam o usuário restrito `panel_app` (`APP_DB_PASSWORD`), sem
  superusuário e sem DDL. É o único que o painel usa nas requisições.
- **Auditoria:** a tabela `audit_log` só aceita inclusões (privilégio e RLS). A retenção de 12 meses é aplicada pela
  função `audit_purge`, com o piso imposto no banco.
- **Imagens da marca:** logo, favicon e fundo ficam no banco (`brand_assets`). As gravações ficam no volume, não no banco.

## Dependências do Jitsi (versão fixa `stable-11248-3`)

A IFrame API não expõe a sala de espera, o papel local, a lista de participantes nem a barra lateral. Por isso
`panel/src/lib/jitsi.ts` lê o estado interno do Jitsi (`APP.store`: `features/lobby`, `features/notifications`,
`features/base/participants`, `features/base/tracks`, `features/base/conference`, `features/toolbox`) e o DOM, e chama
métodos nativos. **Reteste tudo a cada atualização de versão do Jitsi.** As imagens de todos os contêineres do Jitsi e do
Jibri ficam fixadas na mesma tag.
