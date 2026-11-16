-- mod_ddmedia_focus_authz.lua  (v6.3)
-- Autorização POR SALA, aplicada no servidor (Prosody): moderador, usuário comum e sala exclusiva.
--
-- Contexto: com autenticação interna, quem aparece na sala é um participante ANÔNIMO. A conta
-- real só existe numa conexão curta de login, que pede ao Jicofo (focus.<domínio>) um
-- `session-id`. O navegador guarda esse `session-id` e o reenvia em QUALQUER sala; o Jicofo o
-- aceita, e a pessoa viraria moderadora de uma sala para a qual não tem permissão.
--
-- Este módulo fecha isso em dois pontos:
--   1. Conexão de login (host principal): recusa o pedido se a conta não tem acesso à sala.
--   2. Participante anônimo (host dos convidados): o `session-id` só vale se foi emitido a uma
--      conta com acesso à sala PEDIDA. Caso contrário o `session-id` é REMOVIDO do pedido e a
--      pessoa entra como participante comum (sem moderação). `session-id` desconhecido
--      (ex.: depois de reiniciar o Prosody) é tratado do mesmo jeito: fecha por padrão.
--   3. (v6.3, pentest de 2026-11-15) O `session-id` (e o machine-uid) ficam no localStorage da página do
--      Jitsi: quem os copiasse (XSS, extensão, computador compartilhado) entrava na sala como a conta, até em
--      sala exclusiva. Agora o `session-id` só vale se o navegador que o apresenta tem o cookie HttpOnly
--      `__Host-ddpass` ligado à MESMA conta (cookie que nenhum script lê). Sem isso, é tratado como desconhecido.
--
-- Carregar nos DOIS hosts (GLOBAL_MODULES). Política (JSON), relida a cada decisão:
--   (v5) vem do painel: { "version": 3, "settings": {...}, "rooms": { "ddmedia": { "kind": "permanent",
--     "moderators": ["usuario1"], "members": ["usuario2"], "exclusive": false } } }.
--     Sala fora da lista é negada para todos.
--
-- Níveis de uma conta numa sala:
--   moderator: o `session-id` é aceito (Jicofo a torna moderadora) e ela entra direto (sem lobby);
--   member:    usuário comum: o `session-id` é REMOVIDO (sem moderação), mas a sessão é marcada para
--              entrar direto, sem lobby (mod_ddmedia_room_guard, no MUC);
--   nenhum:    mesmo logada, entra como convidada (lobby). Em sala EXCLUSIVA é barrada com erro.
-- Moderador INTERINO (lista `starters` da sala, subconjunto de `members`): enquanto NÃO houver moderador
-- real na sala, o pedido leva uma sessão do Jicofo e a pessoa vira moderadora (abre a sala sozinha, controla
-- a reunião). Com moderador real presente ela entra como usuário comum, sem sessão. O mod_ddmedia_room_guard
-- rebaixa os interinos quando um moderador real entra e os devolve ao posto se ele sair.
-- Modo INVISIVEL (v6.2): moderador real com a opcao na conta e o pedido do painel entra como OBSERVADOR: nivel "member",
-- sem session-id (nenhum comando de moderacao) e com a marca ddmedia_observer.
-- Marcas na sessão do participante: ddmedia_user, ddmedia_level, ddmedia_room, ddmedia_starter, ddmedia_observer.

if module:get_host_type() ~= "local" then return; end -- só VirtualHosts (não componentes)

local st = require "util.stanza";
local filters = require "util.filters";
local jid_split = require "util.jid".split;
local json = require "util.json";
local id = require "util.id";
local promise = require "util.promise";

local FOCUS_NS = "http://jitsi.org/protocol/focus";
local base_domain = module:get_option_string("muc_mapper_domain_base");
if not base_domain then
    module:log("error", "muc_mapper_domain_base nao definido; modulo desativado");
    return;
end

local is_auth_host = (module.host == base_domain);          -- contas reais
local is_guest_host = (module.host:sub(1, 6) == "guest.");  -- participantes anonimos
if not (is_auth_host or is_guest_host) then return; end

local focus_host = module:get_option_string("ddmedia_focus_host", "focus." .. base_domain);

-- session-id -> { user = <conta>, at = <epoch> }.
-- Tabela GLOBAL (prosody.*), de propósito: module:shared() é POR HOST, e as instâncias do host de
-- contas (que anota) e do host de convidados (que confere) enxergariam tabelas diferentes.
-- Também sobrevive a recargas do módulo.
prosody.ddmedia_sessions = prosody.ddmedia_sessions or {};
local sessions = prosody.ddmedia_sessions;
local SESSION_TTL = 24 * 3600;

-- Retomada de sessão (v3): a sessão do Jicofo morre quando a conferência acaba, então o navegador
-- não consegue "guardar" uma. Em vez disso, ligamos o cookie `__Host-ddpass` (entregue pelo painel,
-- HttpOnly) à conta que se autenticou com ele, por REMEMBER_TTL. Quando o painel sinaliza a
-- INTENÇÃO de retomar (cookie `__Host-ddintent=resume`), pedimos ao Jicofo uma sessão em nome da
-- conta (como a conexão de login faz), desde que a conta tenha acesso à sala. Senha nunca é guardada.
prosody.ddmedia_remembered = prosody.ddmedia_remembered or {};  -- token -> { user, at }
local remembered = prosody.ddmedia_remembered;
local REMEMBER_TTL = 24 * 3600;
local PASS_PATTERN = "__Host%-ddpass=(%x+)";
local INTENT_PATTERN = "__Host%-ddintent=(%a+)";

local function capture(event)
    local session, request = event.session, event.request;
    local cookie = request and request.headers and request.headers.cookie;
    if type(cookie) ~= "string" then return; end
    local token = cookie:match(PASS_PATTERN);
    if token and #token >= 32 and #token <= 128 then
        session.ddmedia_pass = token;
    end
    session.ddmedia_resume = (cookie:match(INTENT_PATTERN) == "resume");
end
module:hook_global("websocket-session", capture);
module:hook_global("bosh-session", capture);

-- A política (salas e moderadores) vem do painel pela API interna (mod_ddmedia_admin_api), que a
-- valida com esquema estrito e a guarda em `prosody.ddmedia_policy`. Sem política válida: nega tudo.
local function load_policy()
    local p = prosody.ddmedia_policy;
    return p and p.data or nil;
end

-- Prazo da retomada de sessão (editável no painel; padrão 24 h).
local function remember_ttl()
    local p = prosody.ddmedia_policy;
    return p and p.data.settings.remember_seconds or REMEMBER_TTL;
end

local function in_list(list, username)
    if type(list) ~= "table" then return false; end
    for _, name in ipairs(list) do
        if name == username then return true; end
    end
    return false;
end

-- Nível da conta na sala: "moderator", "member" ou nil (sem acesso). Sala fora da lista: nil.
local function level_for(policy, room, username)
    local rule = policy and policy.rooms[room];
    if not rule or not username then return nil; end
    if in_list(rule.moderators, username) then return "moderator"; end
    if in_list(rule.members, username) then return "member"; end
    return nil;
end

-- Marca a sessão do participante (lida pelo guarda do MUC e pela visão geral do painel).
local function mark(origin, room, username, level, starter, observer)
    origin.ddmedia_user = username;
    origin.ddmedia_level = level;
    origin.ddmedia_room = room;
    origin.ddmedia_starter = starter or nil;
    origin.ddmedia_observer = observer or nil;
end

-- Modo invisivel = OBSERVADOR: moderador real da sala, com a opcao na conta e o pedido do painel, entra como usuario comum
-- (sem session-id: o Jicofo nao o promove, entao nenhum comando de moderacao). O room_guard o esconde e o marca.
local function observer_wanted(origin, policy, room, username)
    local token = origin.ddmedia_pass;
    local req = token and prosody.ddmedia_inv_req and prosody.ddmedia_inv_req[token];
    if not (req and req.room == room) then return false; end
    local profile = policy and policy.profiles and policy.profiles[username];
    return profile ~= nil and profile.invisible == true;
end

-- Moderador interino: usuário comum com o direito de assumir a moderação na ausência de moderador real.
local function is_starter(policy, room, username)
    local rule = policy and policy.rooms[room];
    return rule ~= nil and in_list(rule.starters, username) and level_for(policy, room, username) == "member";
end

-- Há um moderador REAL (conta listada como moderadora) na sala agora? Só sem ele o interino recebe a sessão.
local muc_host = module:get_option_string("ddmedia_muc_host", "muc." .. base_domain);
-- A sala já tem reunião em andamento (existe no MUC)?
local function room_is_live(name)
    local host = prosody.hosts[muc_host];
    local svc = host and host.modules and host.modules.muc;
    if not svc then return false; end
    local found = false;
    pcall(function()
        local iter, a, b;
        if svc.live_rooms then iter, a, b = svc.live_rooms(); else iter, a, b = svc.each_room(true); end
        for r in iter, a, b do
            local n = jid_split(r.jid);
            if type(n) == "string" and n:lower() == name then found = true; break; end
        end
    end);
    return found;
end

local function room_has_real_moderator(name)
    local host = prosody.hosts[muc_host];
    local svc = host and host.modules and host.modules.muc;
    if not svc then return false; end
    local found = false;
    pcall(function()
        local iter, a, b;
        if svc.live_rooms then iter, a, b = svc.live_rooms(); else iter, a, b = svc.each_room(true); end
        for r in iter, a, b do
            local n = jid_split(r.jid);
            if type(n) == "string" and n:lower() == name then
                for _, occupant in r:each_occupant() do
                    for real_jid in pairs(occupant.sessions or {}) do
                        local sess = prosody.full_sessions[real_jid];
                        if sess and sess.ddmedia_level == "moderator" and sess.ddmedia_room == name then found = true; end
                    end
                end
                break;
            end
        end
    end);
    return found;
end

local function refuse(origin, stanza, room, why)
    module:log("warn", "NEGA %s na sala exclusiva %s", why, room);
    origin.send(st.error_reply(stanza, "auth", "forbidden", "sala exclusiva"));
    return true;
end

local function remember(sid, username)
    local now = os.time();
    sessions[sid] = { user = username, at = now };
    for k, v in pairs(sessions) do -- limpeza de sessoes velhas
        if now - v.at > SESSION_TTL then sessions[k] = nil; end
    end
end

-- (1) Anota de quem é cada session-id que o Jicofo entrega a uma conta real.
if is_auth_host then
    local function out_filter(stanza, session)
        if stanza.name == "iq" and stanza.attr.type == "result" and session.username then
            local conference = stanza:get_child("conference", FOCUS_NS);
            local sid = conference and conference.attr["session-id"];
            if sid and sid ~= "" then
                remember(sid, session.username);
                module:log("info", "session-id %s... ligado a %s", sid:sub(1, 4), session.username);
            end
        end
        return stanza;
    end
    module:hook("authentication-success", function(event)
        local session = event.session;
        filters.add_filter(session, "stanzas/out", out_filter, 5);
        -- Navegador com o cookie do painel autenticou: lembra a conta (para a retomada).
        if session.ddmedia_pass and session.username then
            remembered[session.ddmedia_pass] = { user = session.username, at = os.time() };
            module:log("info", "navegador ligado a conta %s (retomada)", session.username);
        end
    end);

    -- Pede ao Jicofo uma sessão EM NOME da conta (o mesmo pedido que a conexão de login faria).
    -- A resposta chega ao JID completo forjado (`iq/full`); `module:send_iq` não a reconhecia,
    -- então ela é capturada aqui, por id.
    local pending = {}; -- id do pedido -> { resolve, reject }
    module:hook("iq/full", function(event)
        local reply = event.stanza;
        local entry = pending[reply.attr.id];
        if not entry or (reply.attr.type ~= "result" and reply.attr.type ~= "error") then return; end
        pending[reply.attr.id] = nil;
        local res = reply:get_child("conference", FOCUS_NS);
        local sid = res and res.attr["session-id"];
        if reply.attr.type == "result" and sid and sid ~= "" then
            entry.resolve(sid);
        else
            entry.reject(reply.attr.type == "error" and "erro do Jicofo" or "resposta sem session-id");
        end
        return true;
    end, 100);

    prosody.ddmedia_mint = function(username, conf)
        local rid = id.medium();
        local req = st.iq({
            type = "set",
            id = rid,
            from = username .. "@" .. base_domain .. "/ddmedia-" .. id.short(),
            to = focus_host,
        });
        req.ddmedia_internal = true;
        local c = st.stanza("conference", {
            xmlns = FOCUS_NS,
            room = conf.attr.room,
            ["machine-uid"] = conf.attr["machine-uid"],
        });
        for prop in conf:childtags("property") do c:add_child(st.clone(prop)); end
        req:add_child(c);
        return promise.new(function(resolve, reject)
            pending[rid] = { resolve = resolve, reject = reject };
            module:add_timer(10, function()
                if pending[rid] then
                    pending[rid] = nil;
                    reject("tempo esgotado");
                end
            end);
            module:send(req);
        end);
    end;
end

-- (1b) Quando um pedido de convidado traz um session-id ACEITO, o Jicofo responde com um session-id
-- (possivelmente NOVO) e o navegador passa a guardar esse. Se não o ligássemos à mesma conta, a
-- próxima retomada de sessão seria rebaixada ("conta desconhecida"). Ligamos o novo à mesma conta.
local function guest_out_filter(stanza, session)
    if stanza.name == "iq" and stanza.attr.type == "result" and session.ddmedia_user then
        local conference = stanza:get_child("conference", FOCUS_NS);
        local sid = conference and conference.attr["session-id"];
        if sid and sid ~= "" then
            remember(sid, session.ddmedia_user);
            module:log("info", "session-id %s... renovado para %s", sid:sub(1, 4), session.ddmedia_user);
        end
    end
    return stanza;
end

-- (2) Vigia os pedidos de conferência enviados ao Jicofo.
local function on_outgoing_iq(event)
    local origin, stanza = event.origin, event.stanza;
    if stanza.attr.to ~= focus_host or stanza.attr.type ~= "set" then return; end

    if stanza.ddmedia_internal then return; end -- pedido emitido por este módulo (retomada)

    local conference = stanza:get_child("conference", FOCUS_NS);
    if not conference then return; end

    local room_jid = conference.attr.room;
    local room = room_jid and jid_split(room_jid);
    if not room then return; end
    room = room:lower();

    local policy = load_policy();

    -- Sala que o painel não cadastrou: ninguém a abre (moderador ou convidado). O nome é validado
    -- pelo painel e pelo esquema da política, então aqui basta checar a presença.
    if not policy or not policy.rooms[room] then
        module:log("warn", "NEGA sala nao cadastrada: %s", room);
        origin.send(st.error_reply(stanza, "auth", "forbidden", "sala nao autorizada"));
        return true;
    end

    local rule = policy.rooms[room];

    -- Sala temporária vencida: nenhuma reunião NOVA abre (reunião em andamento continua até acabar). O painel
    -- também apaga a sala, mas esta recusa vale na hora, sem esperar a rotina do painel.
    if rule.kind == "temporary" and rule.expires_at and os.time() >= rule.expires_at and not room_is_live(room) then
        module:log("warn", "NEGA sala temporaria vencida: %s", room);
        origin.send(st.error_reply(stanza, "auth", "forbidden", "sala expirada"));
        return true;
    end

    if is_auth_host then
        -- Conexão de login de uma conta real. Só a sala exclusiva barra quem não tem acesso; nas demais,
        -- a conta sem acesso loga normalmente e depois entra como convidada (o session-id é rebaixado).
        local username = origin.username;
        if rule.exclusive and not level_for(policy, room, username) then
            module:log("warn", "NEGA pedido de %s para a sala exclusiva %s", tostring(username), room);
            origin.send(st.error_reply(stanza, "auth", "forbidden", "conta sem acesso a esta sala"));
            return true;
        end
        module:log("info", "LIBERA pedido de %s para a sala %s", tostring(username), room);
        return;
    end

    -- Participante anônimo.
    local sid = conference.attr["session-id"];
    if not sid or sid == "" then
        -- Retomada de sessão: só com a INTENÇÃO sinalizada pelo painel, navegador lembrado e conta
        -- com acesso a esta sala. Qualquer outra coisa segue como convidado comum.
        if not (stanza.ddmedia_skip or not origin.ddmedia_resume) then
            local rec = origin.ddmedia_pass and remembered[origin.ddmedia_pass];
            if rec and os.time() - rec.at <= remember_ttl() then
                local level = level_for(policy, room, rec.user);
                local starter = is_starter(policy, room, rec.user) and not room_has_real_moderator(room);
                if level == "moderator" and observer_wanted(origin, policy, room, rec.user) then
                    rec.at = os.time();
                    mark(origin, room, rec.user, "member", nil, true);
                    module:log("info", "retomada: %s volta como observador invisivel na sala %s", rec.user, room);
                    return;
                end
                if level == "member" and not starter then
                    rec.at = os.time(); -- prazo deslizante
                    mark(origin, room, rec.user, "member");
                    module:log("info", "retomada: %s volta como usuario comum na sala %s", rec.user, room);
                    return;
                end
                if (level == "moderator" or starter) and prosody.ddmedia_mint then
                    module:log("info", "retomada: pedindo sessão de %s para a sala %s", rec.user, room);
                    rec.at = os.time(); -- prazo deslizante
                    prosody.ddmedia_mint(rec.user, conference):next(function(new_sid)
                        remember(new_sid, rec.user);
                        conference.attr["session-id"] = new_sid;
                        mark(origin, room, rec.user, level, starter);
                        module:log("info", "retomada: sessão %s... emitida para %s", new_sid:sub(1, 4), rec.user);
                        prosody.core_post_stanza(origin, stanza);
                    end, function(err)
                        module:log("warn", "retomada falhou para %s na sala %s: %s", rec.user, room, tostring(err));
                        stanza.ddmedia_skip = true; -- segue como convidado comum (o painel pedirá login)
                        prosody.core_post_stanza(origin, stanza);
                    end);
                    return true; -- segura o pedido original até a sessão chegar
                end
            end
        end
        if rule.exclusive then return refuse(origin, stanza, room, "convidado"); end
        return;
    end

    local bound = sessions[sid];
    -- (3) v6.3: o session-id só vale no navegador da própria conta (cookie HttpOnly ligado a ela).
    if bound then
        local rec = origin.ddmedia_pass and remembered[origin.ddmedia_pass];
        if rec and rec.user == bound.user and os.time() - rec.at <= remember_ttl() then
            rec.at = os.time(); -- prazo deslizante
        else
            module:log("warn", "session-id %s... de %s apresentado por outro navegador na sala %s: ignorado",
                sid:sub(1, 4), bound.user, room);
            bound = nil;
        end
    end
    local level = bound and level_for(policy, room, bound.user);
    if level == "moderator" and observer_wanted(origin, policy, room, bound.user) then
        module:log("info", "session-id de %s removido na sala %s (observador invisivel)", bound.user, room);
        mark(origin, room, bound.user, "member", nil, true);
        conference.attr["session-id"] = nil;
        return;
    end
    if level == "moderator" then
        module:log("info", "session-id de %s aceito para a sala %s", bound.user, room);
        mark(origin, room, bound.user, "moderator");
        if not origin.ddmedia_out_filter then
            origin.ddmedia_out_filter = true;
            filters.add_filter(origin, "stanzas/out", guest_out_filter, 5);
        end
        return;
    end
    if level == "member" and is_starter(policy, room, bound.user) and not room_has_real_moderator(room) then
        -- Interino sem moderador real na sala: o session-id vai e o Jicofo o promove (ver room_guard).
        module:log("info", "interino %s assume a sala %s", bound.user, room);
        mark(origin, room, bound.user, "member", true);
        if not origin.ddmedia_out_filter then
            origin.ddmedia_out_filter = true;
            filters.add_filter(origin, "stanzas/out", guest_out_filter, 5);
        end
        return;
    end
    if level == "member" then
        -- Usuário comum: entra direto, mas SEM o session-id (o Jicofo não o torna moderador).
        module:log("info", "session-id de %s removido na sala %s (usuario comum)", bound.user, room);
        mark(origin, room, bound.user, "member");
        conference.attr["session-id"] = nil;
        return;
    end

    if rule.exclusive then return refuse(origin, stanza, room, "conta sem acesso"); end
    module:log("warn", "REBAIXA session-id %s... (conta=%s) na sala %s",
        sid:sub(1, 4), bound and bound.user or "desconhecida", room);
    conference.attr["session-id"] = nil; -- vira participante comum: sem moderação, passa pelo lobby
end

module:hook("pre-iq/host", on_outgoing_iq, 10);

module:log("info", "v6.3 carregado em %s (%s)", module.host,
    is_auth_host and "contas" or "convidados");
