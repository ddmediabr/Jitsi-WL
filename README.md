# Servidor de reuniões white label

Jitsi Meet auto-hospedado com um painel próprio. Cada cliente recebe a sua instância, no seu domínio, com a sua marca.

**Recursos:**
- **Salas:** salas com papéis por pessoa (moderador, usuário comum, convidado na sala de espera), sala exclusiva, sala
  com senha rotativa, reunião fechada, moderador interino, modo invisível e salas temporárias;
- **Painel administrativo** com auditoria, 2FA e papéis;
- **Personalização completa da marca:** logo, cores, temas, páginas de entrada e saída, e-mails;
- **Gravação (Jibri)** com entrega automática, retenção e e-mail com link;
- **Transcrição e análise por IA** (Gemini), com `.txt` e `.docx`.

Toda a infraestrutura roda no **Coolify** e é instalada por uma LLM com o MCP do Coolify, seguindo o roteiro deste
repositório.

## Por onde começar

| Quem | Leia |
|---|---|
| Quem vai contratar e preparar a instalação | [docs/INSTALACAO-HUMANA.md](docs/INSTALACAO-HUMANA.md) |
| A LLM que vai instalar | [docs/ROADMAP-LLM.md](docs/ROADMAP-LLM.md) (depois de ARQUITETURA e SEGURANCA) |
| Quem vai entender ou manter o sistema | [docs/ARQUITETURA.md](docs/ARQUITETURA.md), [docs/SEGURANCA.md](docs/SEGURANCA.md), [docs/OPERACAO.md](docs/OPERACAO.md), [docs/TRANSCRICAO.md](docs/TRANSCRICAO.md) |
| Quem vai mexer no código do painel | [panel/README.md](panel/README.md) |

## Estrutura

```
panel/                  Painel e fluxo de entrada (Next.js). No Coolify: app com base_directory /panel
infra/
  jitsi/                Compose do serviço do Jitsi e modelo das variáveis
  prosody/              Módulos do servidor de reuniões (regras de acesso, gravação, API interna, limites)
  jibri/                Compose do gravador, script de entrega e proxy local
  snd-loopback/         Carregador do módulo de som virtual (adaptar ao kernel do servidor)
  traefik/              Regras de roteamento e limites (Dynamic Configuration do proxy)
  panel/                Modelo das variáveis do painel
tools/render_templates.py  Gera os segredos e os arquivos prontos de UMA instalação em build/ (fora do Git)
install.values.example     Dados da instalação (domínio, IP, fuso, marca, uuids)
```

## Versões fixadas

- Jitsi e Jibri: `stable-11248-3` (todas as imagens com a mesma tag).
- Postgres 17 (`postgres:17-alpine`).
- Node 22 (alpine) no painel.
- Next 16.4, React 19.3.
- Traefik do Coolify v3.

## O que nunca vai para o Git

Ficam fora pelo `.gitignore`: `install.values`, `build/` (segredos e arquivos renderizados) e qualquer `.env`. Os segredos
de cada cliente existem só no Coolify dele.
