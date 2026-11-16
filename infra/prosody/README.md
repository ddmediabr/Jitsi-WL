# infra/prosody — módulos do servidor de reuniões

Os módulos abaixo rodam no Prosody do serviço do Jitsi. Eles ficam em `/prosody-plugins-custom/` no contêiner
`prosody`, montada pelo compose (`./prosody-plugins-custom:/prosody-plugins-custom:ro`).

No Coolify, cada arquivo é um **file storage** do serviço. O `resource_uuid` é o do contêiner `prosody` e o
`mount_path` é `/prosody-plugins-custom/<arquivo>`. Arquivos novos nessa pasta aparecem no contêiner sem mudar o compose.

**Envie a versão de `build/prosody/`**, gerada por `tools/render_templates.py`. Ela vem sem comentários e só em ASCII,
que é a forma usada no servidor. Os arquivos desta pasta são a fonte comentada, para leitura e manutenção.

| Arquivo | Carregado por | O que garante |
|---|---|---|
| `mod_ddmedia_admin_api.lua` | `XMPP_MODULES` | API interna HTTP (`/ddmedia-admin`, porta 5280, só rede interna). O painel envia por ela a política de salas, cria, troca a senha e apaga contas, lê as salas ativas e liga o navegador à conta no login. Todo pedido é assinado com HMAC-SHA256 do segredo de `ddmedia-admin.secret`, com tolerância de 60 s e nonce de uso único. Sem política válida, nega tudo. |
| `mod_ddmedia_focus_authz.lua` | `GLOBAL_MODULES` | Quem vira moderador de qual sala. Confere o pedido de conferência ao Jicofo contra a política. O `session-id` só vale no navegador cujo cookie HttpOnly `__Host-ddpass` está ligado à mesma conta. Também faz a retomada de sessão do cadastrado. |
| `mod_ddmedia_room_guard.lua` | `XMPP_MUC_MODULES` | Sala de espera forçada, sala exclusiva, entrada direta de quem tem acesso. Só entram no MUC os hosts `guest.`, `auth.`, `recorder.` e `hidden.`: uma conexão de conta direta é recusada. |
| `mod_ddmedia_reconnect_pass.lua` | `XMPP_MUC_MODULES` | Passe de reconexão. Quem saiu volta sem nova aprovação até `reconnect_pass_seconds` (padrão 900 s). Quem foi removido por um moderador perde o passe. |
| `mod_ddmedia_recording_guard.lua` | `GLOBAL_MODULES` | Só o moderador REAL (cadastrado na sala) inicia ou para a gravação. Moderador interino, comum e convidado são recusados. |
| `mod_ddmedia_auth_limit.lua` | `GLOBAL_MODULES` | Limite de login XMPP direto: 5 erros em 5 min por conta, ou 30 em 5 min por IP, bloqueiam por 15 min. |
| `ddmedia-admin.secret` | lido pela admin_api | Segredo da API interna, 64 caracteres hex. Mesmo valor de `PROSODY_ADMIN_SECRET` no painel. Gerado pelo script. |

**Variáveis do serviço do Jitsi:**

```
GLOBAL_MODULES=ddmedia_focus_authz,ddmedia_recording_guard,ddmedia_auth_limit
XMPP_MODULES=ddmedia_admin_api
XMPP_MUC_MODULES=ddmedia_reconnect_pass,ddmedia_room_guard
ENABLE_AUTO_LOGIN=0
```

**Versões:** focus_authz v6.3, room_guard v1.11, auth_limit v1, reconnect_pass v1.2, admin_api v1.11,
recording_guard v1.1. Cada módulo grava a própria versão no log ao carregar (`vX carregado em <host>`).

## Aplicar mudanças

- **Arquivo alterado:** `manage_storage update` com o uuid do file storage e o conteúdo novo. Depois, recarregue o módulo ou
  reinicie o serviço.
- **Ler o conteúdo atual do servidor:** `manage_storage update` passando só `uuid`, `type` e `mount_path`, sem `content`.
  A resposta devolve o arquivo. Faça isso antes de editar.
- **Recarga ao vivo, sem derrubar reuniões:** por uma tarefa agendada do serviço no contêiner `prosody`, com o comando
  `prosodyctl --config /run/prosody/config/prosody.cfg.lua shell module reload <módulo> <host>`. Depois de usar,
  troque o comando da tarefa para `true` e desligue a tarefa: ela guarda histórico e pode guardar senha.
- **Mudança no compose ou em variáveis:** `manage_service update` com `instant_deploy`. Um `restart` sozinho não reaplica.

## Pegadinhas do Coolify

- Tarefas agendadas rodam como usuário comum: não gravam nos volumes.
- O comando da tarefa aceita `;`, `|` e `sh -c "..."`, mas não aceita `>` nem `&&`. Comandos com mais de ~255 caracteres
  falham.
- Os logs do Coolify trazem só as últimas 100 linhas, com o domínio mascarado.
- As senhas internas do Jibri, do Jicofo e do JVB são criadas pelo próprio contêiner do Prosody na primeira subida
  (`user create`). Trocar uma senha depois **não** atualiza a conta existente: apague a conta com `prosodyctl ... shell user
  delete <conta>@auth.meet.jitsi` e faça o redeploy.
