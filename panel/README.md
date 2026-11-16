# panel — painel e fluxo de entrada

Aplicativo Next.js 16 (App Router, `output: "standalone"`) que atende, no mesmo domínio do Jitsi:
- as telas de entrada: o hall `/` e a sala `/<sala>`, com a escolha cadastrado ou convidado, a preparação de câmera e
  microfone, a sala de espera e o menu de moderação sobre o iframe do Jitsi;
- o painel administrativo `/settings`;
- a API `/flow-api/*`;
- os trabalhos em segundo plano: sincronia da política com o Prosody, varredura de salas temporárias, fila de
  transcrição, limpeza das gravações e da auditoria (`src/instrumentation.ts`).

Visão geral do sistema: [../docs/ARQUITETURA.md](../docs/ARQUITETURA.md).

## Stack

- Next 16, React 19, TypeScript, Tailwind 4, shadcn/ui (estilo `base-nova`, sobre Base UI), lucide-react, Sonner.
- PostgreSQL com Drizzle ORM (`src/server/db/schema.ts`, `auth-schema.ts`). Migrações SQL em `drizzle/`.
- Better Auth (usuário e senha, 2FA), com senhas em Argon2id (`@node-rs/argon2`).
- `sharp` (imagens), `ffmpeg` (vídeo de fundo e áudio da transcrição), `docx` e `undici` (Gemini).

## Mapa do código

| Pasta | Conteúdo |
|---|---|
| `src/app/[room]`, `src/app/page.tsx` | Sala e hall |
| `src/app/settings` | Painel: `(public)` login, setup e recuperação; `(enroll)` ativação obrigatória do 2FA; `(app)` o resto |
| `src/app/flow-api` | API pública e interna: login da sala, passe, papel, senha de sala, gravação, entrega do Jibri, download, marca, avatar, saúde |
| `src/components` | Telas do fluxo (`RoomFlow`, `PrejoinForm`, `RoomMenu`, `ExitScreen`...), `settings/` (formulários do painel), `ui/` (shadcn) |
| `src/lib` | Código puro (servidor e navegador): ponte com o Jitsi (`jitsi.ts`), marca, temas, e-mails (`mail-template.ts`), transcrição, fusos |
| `src/server/auth` | Better Auth, ações de login, papéis (`requireFullAuth`), auditoria, limites |
| `src/server/prosody` | Cliente assinado da API interna do Prosody e montagem e envio da política (`sync.ts`) |
| `src/server/rooms`, `users`, `admins` | Salas (inclui o varredor das temporárias), contas do Jitsi e perfis, usuários do painel |
| `src/server/brand`, `theme`, `hall` | Identidade visual, cores e tema, textos do hall |
| `src/server/recordings` | Entrega do Jibri, listagem, links assinados, e-mail, limpeza, reinício do gravador pelo Coolify |
| `src/server/transcription` | Fila, cascata Gemini, exportação `.txt` e `.docx`, envio do `.zip` |
| `drizzle/` | Migrações aplicadas na inicialização (`src/server/db/migrate.ts`), que também criam o usuário restrito `panel_app` |
| `scripts/` | Ferramentas de emergência e de verificação, rodadas dentro do contêiner (`docs/OPERACAO.md`) |

## Regras do projeto

- **Navegação:** o painel só recebe navegações de **documento** (o Traefik manda `fetch` ao Jitsi). Entre páginas, use
  `<a href>` ou `window.location.assign`, nunca `<Link>` nem `router.*` para rotas de sala. O nome da sala é lido no
  navegador.
- **Segurança:**
  - nenhuma regra de acesso vive só aqui: o Prosody decide;
  - toda ação do servidor confere o papel (`requireFullAuth`);
  - rotas que mudam estado exigem a mesma origem (`sameOrigin`);
  - o IP é sempre o último do `X-Forwarded-For`;
  - segredo nunca em `NEXT_PUBLIC_*`.
- **Jitsi interno:** `src/lib/jitsi.ts` lê `APP.store` e o DOM do iframe (mesma origem). Ao atualizar a versão do Jitsi,
  reteste o fluxo da sala.
- **Desempenho antes de estética:** o iframe do Jitsi divide a thread da página. Então:
  - nada de animação em JavaScript (motion ou framer);
  - nada de `blur` nem `backdrop-filter` sobre o vídeo;
  - só CSS em `transform` e `opacity`, nunca `transition: all`.
- **Movimento:**
  - curvas em `globals.css` (`--ease-out`, `--ease-in-out`, `--ease-drawer`);
  - durações: pressão 140 ms, UI 200 ms, painel 320 ms;
  - entradas partem de `scale(0.97)`, nunca de 0;
  - `prefers-reduced-motion` mantém só o fade.
- **Design de referência:** toda instalação é uma cópia exata do visual deste código. Não se altera CSS, componentes, tokens,
  fontes, ícones, animações nem textos fixos por instalação: o cliente só troca nome, logos, favicon, cores e textos em
  Personalização (dados no banco). A assinatura dos arquivos de design fica em `../docs/design.lock` e é conferida por
  `python ../tools/check_design.py`. Uma mudança de design intencional atualiza o lock no mesmo commit
  (veja [../docs/DESIGN.md](../docs/DESIGN.md)).
- **Marca (white label):**
  - identidade nos tokens de `src/app/globals.css` e em Personalização (nome, logos, favicon, paleta, cor de destaque,
    tema padrão);
  - nenhum componente tem cor ou logo fixos;
  - o nome padrão vem de `BRAND_NAME` (`BRAND_DEFAULT` em `src/server/settings.ts`).
- **Notificações:** as do Jitsi ficam desligadas. Os avisos são próprios, via Sonner (`src/lib/notify.ts`), disparados
  por eventos da IFrame API.
- **Acessibilidade:**
  - foco visível;
  - `aria-current` no menu;
  - alvos de toque ≥ 44 px;
  - botões só com ícone têm `aria-label`;
  - contraste AA nos dois temas.
- **Componentes:** use o do shadcn quando existir (`npx shadcn@latest add <componente>`). Os arquivos de `ui/` são do
  projeto e seguem as regras de movimento acima.
- **Idioma da interface:** pt-BR.

## Variáveis de ambiente

Validadas em `src/server/env.ts`. A lista completa com valores de exemplo está em
[`../infra/panel/panel.env.template`](../infra/panel/panel.env.template).

## Desenvolvimento local

```bash
npm ci
cp ../infra/panel/panel.env.template .env.local   # preencha com um Postgres local e segredos de teste
NEXT_PUBLIC_JITSI_DOMAIN=<domínio de um Jitsi de teste> npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

Sem o Prosody acessível, as telas do painel abrem, mas a sincronia da política e o login da sala dão erro.

## Migrações

Crie o SQL em `drizzle/NNNN_nome.sql` e a entrada em `drizzle/meta/_journal.json`, com o próximo `idx` e um `when`
maior. Atualize também `src/server/db/schema.ts`. O migrador decide pela data: não edite uma migração já aplicada
esperando que ela rode de novo.

## Build

`Dockerfile` em três etapas (deps, build, run). A imagem final roda com `node:22-alpine` e `ffmpeg`, usuário sem
privilégios `app` (10001), porta 3000. A saúde é `GET /flow-api/health`. As gravações ficam no volume `/data/recordings`.
