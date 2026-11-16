# Segurança

O que o produto já faz, o que fica como risco aceito e o que verificar em toda instalação. Esta configuração passou por
um pentest completo (painel, rotas públicas, ações do servidor, XMPP direto, portas e cabeçalhos). Todos os achados
foram corrigidos e retestados. A seção "Verificação de cada instalação" repete os testes que importam.

## Regras que não podem ser quebradas

1. **Segredos novos por cliente.** Gerados pelo `tools/render_templates.py` (256 bits cada), guardados só nas variáveis e
   nos file storages do Coolify. Nunca no Git, nunca em `NEXT_PUBLIC_*`, nunca em log, nunca repetidos entre instalações.
2. **Portas públicas:** 22 (SSH só com chave), 80, 443 e 10000/UDP. A **8000, 6001 e 6002 do Coolify ficam FECHADAS** no
   firewall. O Coolify é acessado pelo domínio HTTPS dele. A 8080 do Traefik e a 5432 do Postgres também ficam fechadas.
3. **`SETUP_TOKEN` só existe até criar o primeiro administrador.** Depois, apague a variável e reinicie o painel. A tela
   `/settings/setup` some sozinha quando existe um administrador.
4. **Tarefas agendadas do Coolify** usadas para rodar comandos (recarregar um módulo, ferramenta de emergência) são
   desligadas e ficam com o comando `true` logo depois. O histórico de execução guarda o comando.
5. **Token do Coolify no painel** (`COOLIFY_API_TOKEN`) só com a permissão **deploy**. Serve para reiniciar o gravador.
6. **Não remover** o domínio técnico `/_flow-test` do painel (veja ARQUITETURA.md): sem ele o roteamento quebra.

## Controles aplicados

**Painel (`/settings`)**
- Login próprio (Better Auth). Senhas com Argon2id (19 MiB, 2 passes), mínimo de 12 caracteres, sem cadastro público.
- Bloqueio de força bruta por usuário e por IP, também para usuário inexistente. As mensagens de erro e o tempo de
  resposta não revelam se a conta existe.
- **2FA** por aplicativo autenticador (TOTP) com códigos de recuperação. Código por e-mail é a alternativa. "Exigir
  verificação em duas etapas de todos" fica em Configurações > Sistema, para o proprietário. Fica **desligado por padrão** (decisão de produto: cada cliente escolhe). A
  recomendação é ligar.
- **Sessão:** cookie HttpOnly, `SameSite=Strict`, `Secure`, só no caminho `/settings`. Dura 8 h absolutas. Mudar o papel,
  redefinir a senha, remover o 2FA ou apagar a conta encerram as sessões daquele usuário.
- **Papéis em lista fechada** (`owner`, `admin`). Toda ação confere o papel no servidor. Ninguém muda o próprio papel ou
  se apaga, e sempre resta um proprietário (transação com trava).
- As rotas HTTP da biblioteca de autenticação não são montadas. Tudo passa por ações do servidor, que verificam a origem
  (CSRF).
- **Cabeçalhos:** CSP com nonce, `frame-ancestors 'none'`, HSTS de 1 ano, `nosniff`, `Referrer-Policy` e
  `Permissions-Policy`.
- **Auditoria só de inclusão** (privilégio e RLS no banco), sem senhas. Retenção mínima de 12 meses, imposta no banco.
- **Banco:** o painel roda com o usuário `panel_app` (sem superusuário e sem DDL). O dono é usado só nas migrações.

**Rotas públicas (`/flow-api/*`)**
- **Origem:** a mesma origem é exigida nas rotas que mudam estado (`Origin: null` ou de outro site resulta em 403).
- **Limites de requisição:**
  - login da sala: 8 tentativas em 10 min por IP+usuário;
  - senha de sala: 20 erros em 10 min por IP;
  - e-mail de transcrição: 10 envios em 10 min por administrador;
  - Traefik: 20/min em login e `closed`, e 300/min no resto.
- **IP:** é sempre o último do `X-Forwarded-For` (o que o Traefik acrescenta).
- **Entrega do gravador:** segredo compartilhado, verificação do formato MP4 (`ftyp`), limite de 8 GB e de 2 entregas
  simultâneas.
- **Link de download por e-mail:** HMAC, válido por 24 h, depois responde 410.
- **Uploads** (foto, logo, favicon, fundo): o tipo é lido pelo conteúdo, a imagem é decodificada e regravada (`sharp`) e
  SVG é recusado. A resposta vai com `nosniff` e CSP `default-src 'none'; sandbox`.
- **Nome de exibição:** recusa `< > " \` { } \` e caracteres de controle. O nome entra em e-mails, documentos e no prompt
  da IA.

**Servidor de reuniões (Prosody, `infra/prosody`)**
- **Autorização por sala** no pedido de conferência. Sem política válida, nega tudo. Sala não cadastrada é negada.
- **`session-id`:** só vale no navegador cujo cookie HttpOnly está ligado à MESMA conta. Um par de sessão roubado do
  localStorage não dá acesso.
- **Contas no MUC:** uma conta não entra no MUC pela conexão autenticada (só os hosts `guest.`, `auth.`, `recorder.` e
  `hidden.`).
- **Sala de espera e senha impostas pelo servidor.** O moderador não as desliga por comando.
- **Nome e foto das contas impostos na presença.** Um convidado com o nome de uma conta ganha " (convidado)".
- **Login XMPP direto:** 5 erros em 5 min por conta, ou 30 em 5 min por IP, bloqueiam por 15 min.
- **Gravação:** só o moderador real.
- **API interna:** só na rede interna (porta 5280, nunca publicada), HMAC com tolerância de 60 s e nonce de uso único,
  esquema estrito.

**Jitsi e infraestrutura**
- `CSP_HEADER=frame-ancestors 'self'`: nenhum site de fora embute a página do Jitsi.
- Todos os contêineres do Jitsi com `read_only` e `tmpfs`.
- O carregador do `snd-aloop` roda sem `--privileged`: só `SYS_MODULE`, `no-new-privileges` e os pacotes do kernel
  conferidos por SHA256.

## Riscos aceitos e limites conhecidos

- **Transcrição:** o áudio sai do servidor para o Google Gemini (plano pago, sem uso para treino). Reuniões
  confidenciais passam por um terceiro. Sem `GEMINI_API_KEY`, o recurso fica desligado.
- **Envio do .zip da transcrição:** qualquer administrador pode enviá-lo a qualquer endereço (com limite e auditoria; o
  endereço não é registrado). Ele já poderia baixar os mesmos arquivos.
- **Modo Apresentador:** o bloqueio de microfone é imposto pelo cliente (limite do Jitsi).
- **Modo invisível:** depende de o cliente não publicar mídia. Um cliente adulterado não foi testado.
- **Retomada de sessão:** quem tiver o cookie HttpOnly `__Host-ddpass` de um cadastrado age como ele por até
  `remember_seconds` (padrão 24 h). Reiniciar o Prosody apaga os vínculos (fecha por padrão: novo login com senha).
- **Usuário comum** removido por um moderador pode voltar direto. Só tirá-lo da lista da sala o barra.
- **Sala existente:** `GET /flow-api/room-info` revela se uma sala existe e se é exclusiva, para mostrar mensagens claras.
- **`/http-bind` (BOSH)** continua aberto além do WebSocket, com as mesmas regras do Prosody.
- **O processo do painel tem o usuário dono do banco** (`DATABASE_ADMIN_URL`), usado só nas migrações da inicialização.
- **Sessão do painel:** 8 h, sem expiração por inatividade e sem checagem de senha vazada.

## Verificação de cada instalação

Rode ao fim da instalação (o ROADMAP-LLM manda) e depois de cada atualização. Cada linha diz o resultado esperado.

**Rede e cabeçalhos**
- [ ] Portas abertas são só 22, 80, 443 e 10000/UDP (8000, 6001, 6002, 8080 e 5432 fechadas).
- [ ] `https://<domínio>/settings/login` tem CSP com nonce, `frame-ancestors 'none'`, `Strict-Transport-Security`
      e `X-Content-Type-Options: nosniff`.
- [ ] `https://<domínio>/config.js` tem `Content-Security-Policy: frame-ancestors 'self'`.
- [ ] `/.env`, `/.git/config`, `/ddmedia-admin/status` e `/package.json` não expõem nada (página do Jitsi, 403 ou 404).

**Painel**
- [ ] `/settings/setup` dá 404 depois do primeiro administrador, e `SETUP_TOKEN` não existe mais nas variáveis.
- [ ] Páginas do painel sem login redirecionam ao login.
- [ ] 6 senhas erradas no login do painel bloqueiam.
- [ ] Um administrador (não proprietário) não abre "Usuários do painel" (nem por URL).
- [ ] `POST /flow-api/closed` e `/flow-api/login` com `Origin: null` respondem 403.
- [ ] 40 `POST /flow-api/login` seguidos: a partir de ~13, a resposta é 429 (Traefik).
- [ ] Entrega do gravador com segredo errado responde 401. Link de download forjado responde 410.

**Servidor de reuniões**
- [ ] Sala não cadastrada não abre.
- [ ] Convidado cai na sala de espera.
- [ ] Moderador entra e continua moderador ao recarregar a página.
- [ ] Usuário comum entra sem privilégios.
- [ ] Sala exclusiva: convidado não vê "Sou convidado", e a conta sem acesso recebe a mensagem de sala exclusiva.
- [ ] Gravar como interino ou usuário comum é recusado. Gravar como moderador real funciona, e o arquivo aparece em
      Gravações.
- [ ] XMPP direto: 6 senhas erradas resultam em `temporary-auth-failure`. A conta sem acesso que entra no MUC pela própria
      conexão recebe `forbidden`.
- [ ] Nome de exibição com `<` é recusado.
