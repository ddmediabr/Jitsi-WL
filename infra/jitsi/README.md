# infra/jitsi — serviço do Jitsi

- `docker-compose.yml`: compose do serviço, colado no Coolify como **Docker Compose Empty**. A imagem é `stable-11248-3`.
- `jitsi.env.template`: as variáveis que precisam de valor. Todas as outras do compose ficam vazias.
  `tools/render_templates.py` gera `build/jitsi/jitsi.env` com os segredos da instalação.

**Características deste compose (mantenha todas):**
- `read_only` e `tmpfs` em `/run` e `/tmp` em todos os contêineres;
- volumes nomeados;
- o prosody monta `./prosody-plugins-custom` (módulos e o segredo da API interna; veja `infra/prosody`);
- o alias de rede do prosody vem de `XMPP_SERVER=prosody`, porque `xmpp.meet.jitsi` não resolve no Coolify;
- só o JVB publica porta, em UDP 10000;
- o `web` não publica porta: o domínio do Coolify `https://<domínio>:8000` cria a rota HTTPS no Traefik.

**Cabeçalhos:** `CSP_HEADER=frame-ancestors 'self'`. A imagem aplica o cabeçalho no `meet.conf`, e só o próprio domínio
pode embutir a página do Jitsi (o painel embute). O HSTS vem das páginas do painel. A imagem só o envia no modo HTTPS
próprio, que fica desligado porque o HTTPS é do Traefik.

**Interface do Jitsi:** toolbar, textos, notificações, logo e desligamento de recursos são passados pelo painel, na
IFrame API (`src/components/RoomFlow.tsx` e `src/lib/jitsi.ts`). O serviço não tem arquivo de interface próprio.
