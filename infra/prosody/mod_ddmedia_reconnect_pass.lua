-- mod_ddmedia_reconnect_pass.lua  (v1)
-- Passe de reconexão: quem já estava na sala pode voltar, sem nova aprovação da sala de espera,
-- durante uma janela de tempo depois de sair (queda de internet, F5, aba fechada sem querer).
--
-- Como funciona (tudo decidido no servidor; o navegador só carrega um segredo):
--   * O fluxo (Next.js) entrega ao navegador um cookie `__Host-ddpass` (aleatório, HttpOnly,
--     Secure, SameSite=Strict, de sessão). Ele vai sozinho no aperto de mão do WebSocket.
--   * Ao abrir o WebSocket, este módulo lê o cookie e o guarda na sessão XMPP.
--   * Quando uma pessoa ENTRA na sala (ou seja, já passou pela sala de espera), registramos um
--     passe (sala + segredo). Enquanto ela está na sala o passe não expira.
--   * Quando ela SAI, o passe passa a expirar em `reconnect_pass_seconds` (padrão 900 = 15 min).
--   * Ao tentar entrar de novo com o mesmo segredo, dentro do prazo, ela recebe afiliação de
--     membro ANTES do portão da sala de espera e entra direto.
--   * Quem é REMOVIDO por um moderador perde o passe (volta a depender de aprovação).
-- Sem o segredo não há passe: nada que o navegador enviar além do cookie vale como credencial.
--
-- Carregar SÓ no componente MUC (XMPP_MUC_MODULES=ddmedia_reconnect_pass).
-- Política (mesmo JSON do outro módulo): { "reconnect_pass_seconds": 900, ... }

if module:get_host_type() ~= "component" then
    module:log("warn", "carregar apenas no componente MUC (XMPP_MUC_MODULES); ignorado em %s", module.host);
    return;
end

local jid = require "util.jid";

local DEFAULT_TTL = 900;
local COOKIE_PATTERN = "__Host%-ddpass=(%x+)";

-- passes[sala][segredo] = { expires = nil (na sala agora) | <epoch> }
-- Tabela GLOBAL (prosody.*): sobrevive a recargas do módulo.
prosody.ddmedia_passes = prosody.ddmedia_passes or {};
local passes = prosody.ddmedia_passes;

-- O Prosody COPIA o objeto do participante a cada operação: campos nossos nele se perdem.
-- Por isso guardamos o estado por JID "bare" (anônimo, único por conexão), em tabelas próprias.
local token_by_bare = {};  -- bare jid -> segredo (quem está na sala)
local kicked_bare = {};    -- bare jid -> true (removido por moderador)

-- Prazo vem da política enviada pelo painel (editável lá); sem política, o padrão.
local function ttl_seconds()
    local p = prosody.ddmedia_policy;
    local n = p and p.data.settings.reconnect_pass_seconds;
    if n and n > 0 then return n; end
    return DEFAULT_TTL;
end

-- Lê o cookie no aperto de mão (WebSocket e BOSH) e guarda na sessão.
local function capture(event)
    local session, request = event.session, event.request;
    local cookie = request and request.headers and request.headers.cookie;
    if type(cookie) ~= "string" then return; end
    local token = cookie:match(COOKIE_PATTERN);
    if token and #token >= 32 and #token <= 128 then
        session.ddmedia_pass = token;
    end
end
module:hook_global("websocket-session", capture);
module:hook_global("bosh-session", capture);

local function token_of(event)
    local session = event.origin;
    if not (session and session.ddmedia_pass) then
        local from = event.stanza and event.stanza.attr.from;
        session = from and prosody.full_sessions[from];
    end
    return session and session.ddmedia_pass;
end

-- Antes do portão da sala de espera (que roda em prioridade -4): passe válido => membro.
module:hook("muc-occupant-pre-join", function(event)
    local room, stanza = event.room, event.stanza;
    if not room:get_members_only() then return; end -- sem sala de espera ativa

    local token = token_of(event);
    if not token then return; end

    local name = jid.node(room.jid);
    local rooms = passes[name];
    local rec = rooms and rooms[token];
    if not rec then return; end

    if rec.expires and os.time() > rec.expires then
        rooms[token] = nil;
        module:log("info", "passe expirado na sala %s", name);
        return;
    end

    local bare = jid.bare(stanza.attr.from);
    local affiliation = room:get_affiliation(bare);
    if affiliation and affiliation ~= "none" then return; end

    -- Igual ao módulo de sala de espera do Jitsi: o papel do participante foi calculado ANTES de
    -- termos dado a afiliação (ficaria sem papel = invisível para o Jicofo). Fixa e salva.
    if event.occupant then event.occupant.role = "participant"; end
    room:set_affiliation(true, bare, "member");
    if event.occupant then room:save_occupant(event.occupant); end
    module:log("info", "passe aceito: %s volta direto para a sala %s", bare, name);
end, 10);

-- Entrou na sala: passe ativo (sem prazo enquanto estiver dentro).
module:hook("muc-occupant-joined", function(event)
    local token = token_of(event);
    if not token then return; end
    local name = jid.node(event.room.jid);
    passes[name] = passes[name] or {};
    passes[name][token] = { expires = nil };
    token_by_bare[event.occupant.bare_jid] = token;
end);

-- Moderador removeu alguém: marca para que a saída NÃO gere passe.
module:hook("muc-pre-set-role", function(event)
    if event.role ~= nil then return; end
    local actor = event.actor and event.room:get_occupant_by_real_jid(event.actor);
    if actor and actor.role == "moderator" and event.occupant then
        kicked_bare[event.occupant.bare_jid] = true;
    end
end);

-- Saiu: começa a contagem do prazo (ou apaga o passe, se foi removido).
module:hook("muc-occupant-left", function(event)
    local occupant = event.occupant;
    local bare = occupant and occupant.bare_jid;
    local token = bare and token_by_bare[bare];
    if not token then return; end
    local was_kicked = kicked_bare[bare];
    token_by_bare[bare] = nil;
    kicked_bare[bare] = nil;
    local name = jid.node(event.room.jid);
    local rooms = passes[name];
    if not (rooms and rooms[token]) then return; end

    if was_kicked then
        rooms[token] = nil;
        module:log("info", "removido por moderador na sala %s: passe apagado", name);
        return;
    end
    local seconds = ttl_seconds();
    rooms[token] = { expires = os.time() + seconds };
    module:log("info", "saiu da sala %s: passe vale por %d s", name, seconds);
end);

-- Limpeza de passes vencidos.
module:add_timer(60, function()
    local now = os.time();
    for name, rooms in pairs(passes) do
        for token, rec in pairs(rooms) do
            if rec.expires and now > rec.expires then rooms[token] = nil; end
        end
        if next(rooms) == nil then passes[name] = nil; end
    end
    return 60;
end);

module:log("info", "v1.2 carregado em %s", module.host);
