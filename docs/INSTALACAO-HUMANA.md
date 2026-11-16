# Instalação — etapas humanas

> **O design é uma cópia exata da instalação de referência.** O visual (telas, cores, tipografia, animações, textos) não
> se altera numa instalação: o cliente só personaliza a identidade da empresa no painel (nome, logos, favicon, e, se
> quiser, cores e textos). Veja [DESIGN.md](DESIGN.md).

Quem instala é uma LLM com acesso ao Coolify pelo MCP. O roteiro dela está em [ROADMAP-LLM.md](ROADMAP-LLM.md). Este
documento lista **o que só uma pessoa pode fazer**: contratar e configurar contas externas, DNS, firewall, criar tokens
na interface do Coolify, criar o primeiro administrador e personalizar a marca.

As etapas marcadas **ANTES** precisam estar prontas antes de chamar a LLM. As marcadas **DURANTE** são pedidas por ela
no momento certo. As marcadas **DEPOIS** são da entrega.

Tempo estimado: 1 h de trabalho humano (sem contar a propagação de DNS e a verificação do domínio de e-mail) e 1 a 2 h
da LLM.

---

## ANTES — 1. Servidor

- **Sistema:** Linux com Docker, de preferência Ubuntu 22.04 ou 24.04. ARM (aarch64) e x86_64 servem: todas as imagens
  são multiplataforma.
- **Tamanho mínimo recomendado:**

  | Recurso | Mínimo | Observação |
  |---|---|---|
  | CPU | 4 vCPU | Uma gravação 720p usa ~0,8 núcleo; dez pessoas numa sala, ~0,5 |
  | Memória | 8 GB | A instalação de referência tem 24 GB. O Jibri (Chrome) usa 2 GB de memória compartilhada |
  | Disco | 100 GB | Gravações: teto padrão de 35 GB no painel. 900p ≈ 0,63 GB/h |

- **IP público fixo.** A mídia das reuniões vai direto ao servidor, por UDP 10000.
- **Uma instalação por servidor.** O gravador, a porta UDP 10000 e o módulo de som são do servidor inteiro.

## ANTES — 2. Coolify

1. Instale o Coolify no servidor (instalador oficial, https://coolify.io/docs).
2. Dê ao Coolify um domínio HTTPS próprio. Por exemplo, `coolify.cliente.com.br` em Settings > Instance's Domain.
3. Confirme que o proxy do servidor é o **Traefik** (Servers > localhost > Proxy).
4. **Crie o token do MCP da LLM:** Keys & Tokens > API Tokens, com as permissões `read`, `read:sensitive`, `write` e
   `deploy`. Entregue à LLM pela configuração do MCP, nunca colando no chat.
5. **Crie um segundo token só com `deploy`**, chamado por exemplo "Painel — reiniciar gravador". O painel usa esse token
   para aplicar a qualidade de gravação. Guarde para a etapa DURANTE 3. O MCP não cria tokens: só pela interface.

## ANTES — 3. Firewall

Na lista de segurança da nuvem (Oracle, AWS, etc.) **e** no firewall do servidor, se houver:

| Porta | Protocolo | Estado |
|---|---|---|
| 22 | TCP | aberta, só login por chave |
| 80, 443 | TCP | abertas |
| 10000 | UDP | aberta (mídia das reuniões) |
| 8000, 6001, 6002 | TCP | **fechadas** (o Coolify segue acessível pelo domínio HTTPS) |
| 8080, 5432 e todo o resto | — | fechadas |

## ANTES — 4. DNS

- Registro **A** do domínio das reuniões (ex.: `meet.cliente.com.br`) apontando para o IP público do servidor.
- Registro **A** do domínio do Coolify, se ainda não existir.
- Sem proxy de CDN no domínio das reuniões (Cloudflare com nuvem laranja quebra o WebSocket e a mídia): use "DNS only".

## ANTES — 5. Código

O Coolify precisa ler este repositório:
- **Repositório público:** basta a URL.
- **Repositório privado:** instale o **GitHub App** do Coolify na organização (Sources > GitHub App) com acesso a este
  repositório, e informe à LLM o nome do app.

## ANTES — 6. Serviços externos (opcionais, mas recomendados)

| Serviço | Para quê | O que entregar |
|---|---|---|
| **Resend** (resend.com) | "Esqueci a senha", código 2FA por e-mail, link da gravação e envio da transcrição | Verifique o domínio de envio (registros SPF/DKIM no DNS) e crie uma chave de API "Sending access". Entregue `RESEND_API_KEY` e `MAIL_FROM` (ex.: `Cliente Meet <no-reply@cliente.com.br>`, do domínio verificado) |
| **Google AI Studio** | Transcrição e análise das gravações | Projeto **com faturamento**. Entregue `GEMINI_API_KEY` |
| **Armazenamento S3** (Cloudflare R2, Backblaze B2, AWS S3, Oracle Object Storage) | Backup diário do banco fora do servidor | Bucket **só para backups** (1 GB basta). Chave limitada a esse bucket, com "Object Read & Write" (no R2: R2 > Manage API Tokens; nunca "Admin"). **Cadastre você mesmo** em Coolify > Storages > S3 (região `auto` no R2) e informe à LLM só o nome. Assim as chaves não passam pelo chat |

Sem o Resend, os recursos de e-mail ficam desligados. Sem o Gemini, a transcrição fica desligada. Sem o S3, o backup fica
só no servidor (não recomendado).

## ANTES — 7. Dados da instalação para a LLM

- Domínio das reuniões, IP público, fuso horário (IANA, ex.: `America/Sao_Paulo`) e o nome da marca (até 40
  caracteres). Esse nome é o padrão do painel e aparece no aplicativo autenticador do 2FA.
- Nome do GitHub App (se o repositório for privado) e nome do storage S3.
- As chaves opcionais: Resend e Gemini. Passe por um canal seguro ou cadastre você mesmo depois, nas variáveis do app do
  painel.

---

## DURANTE — 1. Regras do Traefik

A LLM não grava arquivos no servidor. Quando ela entregar o `jitsi-flow.yaml` pronto:
1. Abra Coolify > Servers > localhost > Proxy > **Dynamic Configurations** > Add.
2. Use o nome `jitsi-flow.yaml`, cole o conteúdo e salve.
3. Avise a LLM.

O Traefik aplica na hora. Se já existir um arquivo com esse nome (reinstalação), guarde uma cópia antes de substituir.

## DURANTE — 2. Primeiro administrador

1. A LLM entrega o `SETUP_TOKEN` (por canal seguro).
2. Abra `https://<domínio>/settings/setup` e crie a conta **proprietária** (usuário, e-mail e senha forte de 12+
   caracteres).
3. Entre e ative o 2FA em **Segurança** (aplicativo autenticador). Guarde os códigos de recuperação.
4. Avise a LLM. Ela apaga o `SETUP_TOKEN`, e a tela de setup some.

## DURANTE — 3. Token do gravador

Entregue à LLM o token **só deploy** da etapa ANTES 2.5. Ou cadastre você mesmo `COOLIFY_API_TOKEN` no app do painel,
com `COOLIFY_URL=https://<domínio do Coolify>`. Sem ele, o botão "Aplicar agora" da qualidade de gravação fica
desligado, e a mudança vale no próximo reinício do gravador.

## DURANTE — 4. Conta e sala de teste

Para o teste de aceite, crie no painel:
1. **Contas** > uma conta de teste com e-mail.
2. **Salas** > a sala `teste-instalacao`, com essa conta como moderadora.

Entregue o usuário e a senha à LLM, se ela for rodar o teste automatizado.

---

## DEPOIS — 1. Personalização da marca (painel, como proprietário)

**Sem mexer em nada, a instalação já sai idêntica à de referência** (paleta azul, tema escuro, fundo da entrada em vídeo,
textos e e-mails padrão). Para ser da empresa, bastam o **nome**, os **logos** e o **favicon**. O resto da tabela abaixo é
opcional e só deve mudar se o cliente pedir.

| Menu | O que ajustar |
|---|---|
| **Personalização** | Nome da marca, logo do tema escuro e do claro (PNG/JPG/WebP até 2 MB; o logo substitui o nome), favicon, paleta e cor de destaque de cada tema, cor do texto dos botões, tema padrão, fundo das páginas de entrada (imagem ou vídeo até 10 MB), textos do hall (`/`), textos das páginas de saída (saiu, removido, encerrada), modelo do e-mail da gravação e a cor dos e-mails |
| **Configurações > Sistema** | "Exigir verificação em duas etapas de todos" (recomendado) e fuso horário do painel (datas, auditoria, limpeza das 4h) |
| **Configurações > Sala (Live)** | Quadros por segundo do compartilhamento de tela, retenção (padrão 30 dias) e teto de espaço das gravações (padrão 35 GB), qualidade da gravação (padrão 900p) e "gravador em servidor dedicado", glossário da transcrição |
| **Configurações > Usuários** | Outros administradores do painel |
| **Salas > Configurações** | Passe de reconexão (padrão 15 min) e retomada de sessão (padrão 24 h) |
| **Segurança** | O 2FA da sua própria conta |

## DEPOIS — 2. Contas e salas reais

- **Contas** (contas do Jitsi): nome, e-mail (para receber gravações), foto, modo invisível.
- **Salas**: nome (vira o endereço `https://<domínio>/<sala>`), moderadores, usuários comuns, sala exclusiva, sala de
  espera, sala com senha, quem pode iniciar (moderador interino), sala temporária.

## DEPOIS — 3. Conferência do design

A LLM já confere o código e as configurações (ROADMAP-LLM, Fase 9). A conferência visual é sua, nos temas **escuro e claro**,
em **1440 px e 390 px** de largura:

- [ ] Hall `https://<domínio>/` e uma sala (escolha cadastrado ou convidado).
- [ ] Login do painel e "esqueci a senha".
- [ ] Painel: Visão geral, Salas, Contas, Personalização, Gravações, Configurações.
- [ ] Dentro da sala: barra do Jitsi, menu de moderação e sala de espera.
- [ ] Um e-mail de teste (gravação ou redefinir senha).
- [ ] Tudo igual à instalação de referência. **Só podem ser diferentes** o nome da marca, os logos e o favicon.
- [ ] Nenhum nome ou logo de outra empresa aparece em lugar nenhum.

Se algo estiver diferente, **não corrija no código**: avise o dono do produto (veja [DESIGN.md](DESIGN.md)).

## DEPOIS — 4. Teste de aceite (com aparelhos reais)

- [ ] Celular em rede 4G (fora do Wi-Fi do servidor) entra como convidado e cai na sala de espera. O moderador aprova, e
      áudio e vídeo funcionam dos dois lados.
- [ ] O moderador no computador entra pela tela de login da sala.
- [ ] Gravar 1 a 2 min falando, com "Transcrever ao final" ligado. A gravação aparece em Gravações, e o e-mail chega ao
      moderador com o link, o `.txt` e o `.docx` (se o Gemini estiver configurado).
- [ ] "Esqueci a senha" no painel envia o e-mail.
- [ ] Depois do aceite, apague a sala e a conta de teste.

## DEPOIS — 5. Guarda dos segredos

A LLM gera os segredos da instalação em `build/secrets.env`, na máquina dela. Os valores já estão no Coolify, que é a
fonte. Guarde esse arquivo num cofre de senhas do cliente, ou peça para a LLM apagá-lo. **Ele não vai para o Git.**
