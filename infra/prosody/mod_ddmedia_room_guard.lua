-- mod_ddmedia_room_guard.lua  (v1)
-- Guarda da SALA (componente MUC), aplicado no servidor conforme a política do painel. Não depende
-- do navegador: o que a interface esconde aqui é, além disso, IMPOSSÍVEL de fazer por comando direto.
--
--   1. LOBBY DEFINIDO PELO PAINEL: cada sala cadastrada tem o lobby ligado ou desligado conforme a política
--      (`lobby`, padrão ligado). Um moderador que tente mudá-lo (ou mexer na senha da sala) pela interface
--      ou por comando direto é ignorado: o formulário de configuração é normalizado antes de ser aplicado.
--   2. SALA EXCLUSIVA: em salas com `exclusive = true` só entra quem a política autoriza (moderador
--      ou usuário comum). Os demais, mesmo logados, recebem "forbidden" direto, sem sala de espera.
--      A decisão usa a marca que o `mod_ddmedia_focus_authz` coloca na sessão (ddmedia_room /
--      ddmedia_level) ao liberar o pedido de conferência; entrar no MUC sem passar por ele não vale.
--   3. ENTRADA LIVRE: moderador e usuário comum da sala entram sem passar pela sala de espera
--      (recebem afiliação de membro antes do portão da sala de espera, como o passe de reconexão).
--      Convidados e contas sem acesso à sala seguem para a sala de espera.
--
-- Carregar SÓ no componente MUC (XMPP_MUC_MODULES=ddmedia_reconnect_pass,ddmedia_room_guard).
-- Política: lida de `prosody.ddmedia_policy` (publicada por mod_ddmedia_admin_api).

if module:get_host_type() ~= "component" then
    module:log("warn", "carregar apenas no componente MUC (XMPP_MUC_MODULES); ignorado em %s", module.host);
    return;
end

local jid = require "util.jid";
local st = require "util.stanza";
local filters = require "util.filters";

local function rule_for(room)
    local p = prosody.ddmedia_policy;
    local name = jid.node(room.jid);
    return p and name and p.data.rooms[name:lower()] or nil;
end

-- Sessões de convidados (anônimos) são as únicas sujeitas à regra de exclusividade; as contas internas
-- (Jicofo, JVB, Jibri, Jigasi) entram pelo domínio interno e não são tocadas. A decisão usa o JID REAL
-- da sessão, nunca o apelido: um convidado poderia escolher o apelido "focus".
local function is_guest_session(from)
    local _, host = jid.split(from or "");
    return host ~= nil and host:sub(1, 6) == "guest.";
end

-- (0) v1.11 (pentest de 2026-11-15): a conexão de CONTA (host de contas, ex.: meet.jitsi) NÃO entra no MUC.
-- O navegador só usa essa conexão para obter a sessão do Jicofo e entra na sala pela conexão de convidado,
-- onde valem o lobby e a regra de sala exclusiva. Um cliente XMPP direto que entrasse pela conexão de conta
-- pulava as duas regras (só convidados eram checados). Entram: convidados (`guest.`) e as contas internas
-- (`auth.`: Jicofo/Jigasi; `recorder.`/`hidden.`: gravador e transcritor). Qualquer outro host é recusado.
local function allowed_host(host)
    return host:sub(1, 6) == "guest." or host:sub(1, 5) == "auth." or host:sub(1, 9) == "recorder." or host:sub(1, 7) == "hidden.";
end

module:hook("muc-occupant-pre-join", function(event)
    local stanza = event.stanza;
    local _, host = jid.split(stanza.attr.from or "");
    if host == nil or allowed_host(host) then return; end
    module:log("warn", "NEGA entrada no MUC pela conexao de conta (%s) na sala %s", tostring(jid.bare(stanza.attr.from)), tostring(jid.node(event.room.jid)));
    event.origin.send(st.error_reply(stanza, "auth", "forbidden", "entre pela pagina da sala"));
    return true;
end, 100);

local function level_in_room(event)
    local stanza, room = event.stanza, event.room;
    local sess = stanza and prosody.full_sessions[stanza.attr.from];
    if not sess then return nil; end
    local name = jid.node(room.jid);
    if sess.ddmedia_room ~= (name and name:lower()) then return nil; end
    if sess.ddmedia_level == "moderator" or sess.ddmedia_level == "member" then return sess.ddmedia_level; end
    return nil;
end

-- (2) Sala exclusiva: barra quem não tem acesso (antes de qualquer outra coisa).
module:hook("muc-occupant-pre-join", function(event)
    local room, stanza = event.room, event.stanza;
    local rule = rule_for(room);
    if not rule or not rule.exclusive then return; end
    if not is_guest_session(stanza.attr.from) then return; end
    if level_in_room(event) then return; end

    module:log("warn", "NEGA entrada direta na sala exclusiva %s", jid.node(room.jid));
    event.origin.send(st.error_reply(stanza, "auth", "forbidden", "sala exclusiva"));
    return true;
end, 60);

-- (1a) Lobby conforme a política. `enforce_lobby` liga ou desliga o lobby da sala segundo a política, pelos
-- eventos globais do módulo de sala de espera do Jitsi (idempotentes). Roda (i) antes de qualquer
-- participante entrar (depois do Jicofo, que entra primeiro e é isentado) e (ii) em TODAS as salas ativas
-- assim que a política muda (ver o temporizador abaixo), para que ligar/desligar o lobby no painel valha
-- na hora, sem esperar o próximo participante.
-- Reunião fechada (marcada por um moderador, pelo painel): enquanto durar, a sala exige aprovação de quem
-- não é moderador (inclui usuários comuns) mesmo que o lobby esteja desligado no painel.
prosody.ddmedia_closed = prosody.ddmedia_closed or {};
local function is_closed(room)
    local name = jid.node(room.jid);
    return name ~= nil and prosody.ddmedia_closed[name:lower()] == true;
end

local function enforce_lobby(room)
    local rule = rule_for(room);
    if not rule then return; end
    if rule.lobby ~= false or is_closed(room) then
        if room:get_members_only() then return; end
        local ok, err = pcall(function()
            prosody.events.fire_event("create-lobby-room", { room = room });
        end);
        if not ok then module:log("error", "falha ao ligar o lobby de %s: %s", jid.node(room.jid), tostring(err)); end
    elseif room:get_members_only() or room._data.lobbyroom then
        local ok, err = pcall(function()
            prosody.events.fire_event("destroy-lobby-room", { room = room });
            if room:get_members_only() then room:set_members_only(false); end
        end);
        if not ok then module:log("error", "falha ao desligar o lobby de %s: %s", jid.node(room.jid), tostring(err)); end
    end
end

module:hook("muc-occupant-pre-join", function(event)
    if not is_guest_session(event.stanza.attr.from) then return; end
    enforce_lobby(event.room);
end, 50);

-- Política nova (o hash muda): reaplica o lobby em todas as salas ativas.
local last_hash;
module:add_timer(3, function()
    local p = prosody.ddmedia_policy;
    if p and p.hash ~= last_hash then
        local first = (last_hash == nil);
        last_hash = p.hash;
        if not first then
            local host = prosody.hosts[module.host];
            local svc = host and host.modules and host.modules.muc;
            if svc then
                local ok, err = pcall(function()
                    local iter, a, b;
                    if svc.live_rooms then iter, a, b = svc.live_rooms(); else iter, a, b = svc.each_room(true); end
                    for room in iter, a, b do enforce_lobby(room); end
                end);
                if not ok then module:log("error", "falha ao reaplicar o lobby: %s", tostring(err)); end
            end
        end
    end
    return 3;
end);

-- (3) Entrada livre de quem tem acesso à sala (antes do portão da sala de espera, prioridade -4).
module:hook("muc-occupant-pre-join", function(event)
    local room, stanza = event.room, event.stanza;
    if not room:get_members_only() or not rule_for(room) then return; end
    local level = level_in_room(event);
    if not level then return; end
    local own = prosody.full_sessions[stanza.attr.from];
    if level == "member" and is_closed(room) and not (own and own.ddmedia_observer) then return; end -- reunião fechada: usuário comum espera aprovação (observador invisível não)

    local bare = jid.bare(stanza.attr.from);
    local affiliation = room:get_affiliation(bare);
    if affiliation and affiliation ~= "none" then return; end

    -- O papel do participante foi calculado ANTES da afiliação (ficaria sem papel = invisível ao
    -- Jicofo): fixa e salva, como o módulo da sala de espera do Jitsi.
    if event.occupant then event.occupant.role = "participant"; end
    room:set_affiliation(true, bare, "member");
    if event.occupant then room:save_occupant(event.occupant); end
    module:log("info", "acesso direto (%s) na sala %s", level, jid.node(room.jid));
end, 20);

-- (1b) Configuração da sala: o lobby segue a política (não pode ser ligado/desligado por moderador) e a senha
-- da sala não pode ser mudada (o formulário é normalizado antes de o módulo da sala de espera e o Prosody o lerem).
module:hook("muc-config-submitted", function(event)
    local room, fields = event.room, event.fields;
    local rule = rule_for(room);
    if not fields or not rule then return; end
    if not is_guest_session(event.actor) then return; end
    local want = rule.lobby ~= false or is_closed(room);
    if (fields["muc#roomconfig_membersonly"] == true) ~= want then
        module:log("warn", "ignorado: moderador tentou mudar o lobby de %s", jid.node(room.jid));
    end
    fields["muc#roomconfig_membersonly"] = want;
    if fields["muc#roomconfig_roomsecret"] ~= nil then
        fields["muc#roomconfig_roomsecret"] = room:get_password() or "";
    end
end, 100);

-- Início da sessão de cada sala (a visão geral do painel mostra há quanto tempo ela está ativa).
-- Reunião fechada ligada/desligada: reaplica o lobby na hora (o evento vem do mod_ddmedia_admin_api).
module:hook_global("ddmedia-room-closed", function(event)
    local host = prosody.hosts[module.host];
    local svc = host and host.modules and host.modules.muc;
    if not svc or type(event.room) ~= "string" then return; end
    pcall(function()
        local iter, a, b;
        if svc.live_rooms then iter, a, b = svc.live_rooms(); else iter, a, b = svc.each_room(true); end
        for room in iter, a, b do
            local n = jid.node(room.jid);
            if n and n:lower() == event.room then enforce_lobby(room); end
        end
    end);
end);

-- MODERADOR INTERINO: usuário comum (lista `starters`) que assume a moderação enquanto não há moderador real.
--   * entra sem moderador real na sala  -> vira dono (o Jicofo o promove; garantimos aqui também);
--   * um moderador real entra           -> todos os interinos são rebaixados a usuário comum, na hora;
--   * o último moderador real sai       -> os interinos presentes voltam a ser donos.
-- Além disso, ninguém é promovido a dono/admin pelo Jicofo se não for moderador real ou interino elegível: um
-- moderador (ou interino) não cria outros moderadores pelas ações nativas do Jitsi.
local function room_key(room)
    local n = jid.node(room.jid);
    return n and n:lower();
end

local function occupant_session(occupant)
    for real_jid in pairs(occupant.sessions or {}) do
        local sess = prosody.full_sessions[real_jid];
        if sess then return sess; end
    end
    return nil;
end

local function real_moderator_present(room, skip)
    local key = room_key(room);
    for _, occupant in room:each_occupant() do
        if occupant ~= skip then
            local sess = occupant_session(occupant);
            if sess and sess.ddmedia_level == "moderator" and sess.ddmedia_room == key then return true; end
        end
    end
    return false;
end

local function each_interim(room, skip, fn)
    local key = room_key(room);
    for _, occupant in room:each_occupant() do
        if occupant ~= skip then
            local sess = occupant_session(occupant);
            if sess and sess.ddmedia_starter and sess.ddmedia_level == "member" and sess.ddmedia_room == key then
                fn(occupant);
            end
        end
    end
end

local function set_affiliation(room, occupant, affiliation)
    local ok, err = pcall(room.set_affiliation, room, true, occupant.bare_jid, affiliation);
    if not ok then module:log("error", "falha ao mudar %s para %s: %s", tostring(occupant.bare_jid), affiliation, tostring(err)); end
end

module:hook("muc-occupant-joined", function(event)
    local room, occupant = event.room, event.occupant;
    if not rule_for(room) or not occupant then return; end
    local sess = occupant_session(occupant);
    if not sess or sess.ddmedia_room ~= room_key(room) then return; end
    if sess.ddmedia_level == "moderator" then
        each_interim(room, occupant, function(o)
            module:log("info", "interino rebaixado na sala %s: entrou moderador real", room_key(room));
            set_affiliation(room, o, "member");
        end);
    elseif sess.ddmedia_starter and sess.ddmedia_level == "member" and not real_moderator_present(room, occupant) then
        module:log("info", "interino assume a sala %s (sem moderador real)", room_key(room));
        set_affiliation(room, occupant, "owner");
    end
end, -10);

-- Confere se ainda há moderador real; se não, os interinos presentes voltam a ser donos. Roda um instante
-- depois da saída (a ordem em que o Prosody retira o ocupante não é garantida no momento do evento).
local function reconcile(room)
    local ok, err = pcall(function()
        local present = real_moderator_present(room);
        module:log("info", "reconferencia na sala %s: moderador real presente = %s", room_key(room), tostring(present));
        if present then return; end
        each_interim(room, nil, function(o)
            module:log("info", "interino na sala %s: papel atual = %s", room_key(room), tostring(o.role));
            if o.role ~= "moderator" then
                module:log("info", "interino volta ao posto na sala %s (sem moderador real)", room_key(room));
                set_affiliation(room, o, "owner");
            end
        end);
    end);
    if not ok then module:log("error", "falha ao reconferir moderadores de %s: %s", tostring(room.jid), tostring(err)); end
end

module:hook("muc-occupant-left", function(event)
    local room = event.room;
    if not rule_for(room) then return; end
    module:log("info", "saida na sala %s: reconferencia agendada", room_key(room));
    module:add_timer(1, function() reconcile(room); end);
    module:add_timer(5, function() reconcile(room); end);
end, -10);

module:hook("muc-pre-set-affiliation", function(event)
    if event.affiliation ~= "owner" and event.affiliation ~= "admin" then return; end
    if event.actor == true then return; end -- decisão deste módulo
    local room = event.room;
    local key = room_key(room);
    if not key or not rule_for(room) then return; end
    local target = event.jid or "";
    if not is_guest_session(target) then return; end -- contas internas (Jicofo, etc.) não são tocadas
    local bs = prosody.bare_sessions[jid.bare(target)];
    local allowed = false;
    for _, sess in pairs(bs and bs.sessions or {}) do
        if sess.ddmedia_room == key then
            if sess.ddmedia_level == "moderator" then
                allowed = true;
            elseif sess.ddmedia_starter and sess.ddmedia_level == "member" and not real_moderator_present(room) then
                allowed = true;
            end
        end
    end
    if not allowed then
        module:log("warn", "recusada a promocao de %s na sala %s", target, key);
        event.allowed = false;
    end
end, 100);

-- IDENTIDADE NA SALA: nome de exibicao e foto sao impostos pelo servidor.
--   * conta cadastrada: o nome e a foto vem do painel (politica), nao do que o navegador mandou;
--   * convidado: o nome digitado e limpo (sem caracteres de controle, ate 60 letras), sem foto e sem e-mail; se for o nome
--     (ou o usuario) de uma conta, ganha " (convidado)" no fim, para ninguem se passar por outra pessoa.
-- Vale na entrada e em toda mudanca de presenca, entao um comando direto no navegador nao burla.
local NICK_NS = "http://jabber.org/protocol/nick";
local STRIP = { ["avatar-url"] = true, ["avatar-id"] = true, email = true };
local CUT_TAIL = "[" .. string.char(194) .. "-" .. string.char(244) .. "][" .. string.char(128) .. "-" .. string.char(191) .. "]*$";

local function clean_guest_name(typed)
    typed = typed:gsub("%c", " "):gsub("%s+", " "):gsub("^ ", ""):gsub(" $", "");
    if #typed > 120 then typed = typed:sub(1, 120):gsub(CUT_TAIL, ""); end
    if typed == "" then typed = "Convidado"; end
    return typed;
end

local function enforce_identity(event, is_join)
    local stanza = event.stanza;
    if not stanza or not is_guest_session(stanza.attr.from) then return; end
    local room = event.room;
    if not rule_for(room) then return; end
    local p = prosody.ddmedia_policy;
    local sess = prosody.full_sessions[stanza.attr.from];
    local profiles = p.data.profiles or {};
    local nick, avatar;
    local key = jid.node(room.jid):lower();
    if sess and sess.ddmedia_user and sess.ddmedia_room == key then
        local prof = profiles[sess.ddmedia_user];
        nick = prof and prof.name or sess.ddmedia_user;
        if prof and prof.photo then avatar = "/flow-api/avatar/" .. sess.ddmedia_user .. "?v=" .. tostring(prof.photo); end
    elseif sess and sess.ddmedia_guest_nick and not is_join then
        -- Convidado: o nome e definido NA ENTRADA e nao muda mais enquanto ele estiver na sala (como no Google Meet).
        nick = sess.ddmedia_guest_nick;
    else
        local typed = clean_guest_name(stanza:get_child_text("nick", NICK_NS) or "");
        local taken = p.data.taken_names or {};
        if taken[(typed:lower():gsub("%s+", " "))] then typed = typed .. " (convidado)"; end
        nick = typed;
        if sess then sess.ddmedia_guest_nick = nick; end
    end
    stanza:maptags(function(tag)
        if STRIP[tag.name] or (tag.name == "nick" and tag.attr.xmlns == NICK_NS) then return nil; end
        return tag;
    end);
    stanza:add_child(st.stanza("nick", { xmlns = NICK_NS }):text(nick));
    if avatar then stanza:add_child(st.stanza("avatar-url"):text(avatar)); end
end
module:hook("muc-occupant-pre-join", function(event) return enforce_identity(event, true); end, 90);
module:hook("muc-occupant-pre-change", function(event) return enforce_identity(event, false); end, 90);

-- ------------------------------------------------------------------------------------------------
-- Sala com senha: quem acertou a senha (o painel confirmou com o Prosody: ver mod_ddmedia_admin_api) ganha um prazo curto
-- para entrar DIRETO, sem sala de espera. O prazo e ligado ao segredo do navegador (cookie __Host-ddpass), vale uma vez e
-- nunca vale numa sala exclusiva ou com a Reuniao Fechada.
-- ------------------------------------------------------------------------------------------------
module:hook("muc-occupant-pre-join", function(event)
    local room, stanza = event.room, event.stanza;
    if not room:get_members_only() then return; end
    if not is_guest_session(stanza.attr.from) then return; end
    local rule = rule_for(room);
    if not rule or rule.password ~= true or rule.exclusive then return; end
    if is_closed(room) then return; end
    local sess = prosody.full_sessions[stanza.attr.from];
    local token = sess and sess.ddmedia_pass;
    if not token then return; end
    local name = jid.node(room.jid):lower();
    local entry = prosody.ddmedia_entry and prosody.ddmedia_entry[name];
    local exp = entry and entry[token];
    if not exp then return; end
    entry[token] = nil; -- uso unico
    if os.time() > exp then return; end
    local bare = jid.bare(stanza.attr.from);
    local affiliation = room:get_affiliation(bare);
    if affiliation and affiliation ~= "none" then return; end
    if event.occupant then event.occupant.role = "participant"; end
    room:set_affiliation(true, bare, "member");
    if event.occupant then room:save_occupant(event.occupant); end
    module:log("info", "entrada por senha na sala %s: %s", name, bare);
end, 12);

-- ------------------------------------------------------------------------------------------------
-- Modo invisivel: moderador REAL da sala, com a opcao ligada na conta, entra sem aparecer para ninguem (so a propria pessoa e o
-- Jicofo veem a presenca). Quem esta invisivel nao fala no chat nem manda mensagens. O pedido vem do painel (segredo do navegador).
-- ------------------------------------------------------------------------------------------------
prosody.ddmedia_hidden_nick = prosody.ddmedia_hidden_nick or {};    -- JID da sala + apelido -> JID real (bare) da pessoa
prosody.ddmedia_invisible_bare = prosody.ddmedia_invisible_bare or {};

-- Filtro de saida de cada sessao que ENTRA numa sala: descarta presenca/mensagem vinda de um invisivel, exceto para ele mesmo
-- e para o Jicofo (que precisa enxergar os participantes para montar a chamada).
local INVISIBLE_MARK = "\240\159\145\129 "; -- "👁 " antes do nome, so para quem pode ver

-- Quem enxerga o invisivel: ele mesmo, o Jicofo, moderadores REAIS da mesma sala e outros observadores dela. Usuario comum
-- (inclusive interino, que tem nivel "member") e convidado nunca. Os moderadores veem o nome com o simbolo na frente.
local function hide_filter(stanza, session)
    local from = stanza.attr.from;
    if from and (stanza.name == "presence" or stanza.name == "message") then
        local owner = prosody.ddmedia_hidden_nick[from];
        if owner then
            local mine = session.full_jid and jid.bare(session.full_jid);
            if mine == owner or session.username == "focus" then return stanza; end
            local node = jid.node(from);
            local same_room = node and session.ddmedia_room == node:lower();
            if stanza.name == "presence" and same_room and (session.ddmedia_level == "moderator" or session.ddmedia_observer) then
                local copy = st.clone(stanza);
                copy:maptags(function(tag)
                    if tag.name == "nick" and tag.attr.xmlns == "http://jabber.org/protocol/nick" then
                        return st.stanza("nick", { xmlns = "http://jabber.org/protocol/nick" }):text(INVISIBLE_MARK .. (tag:get_text() or ""));
                    end
                    return tag;
                end);
                return copy;
            end
            return nil;
        end
    end
    return stanza;
end

local function install_hide_filter(sess)
    if sess and not sess.ddmedia_hide_filter and sess.filters then
        sess.ddmedia_hide_filter = true;
        filters.add_filter(sess, "stanzas/out", hide_filter, -90);
    end
end

-- O apelido deste ocupante esta escondido? (decidido AQUI, na entrada: nunca pelo que o navegador mandar)
local function wants_invisible(event, key)
    local stanza = event.stanza;
    local sess = prosody.full_sessions[stanza.attr.from];
    if not (sess and sess.ddmedia_user and sess.ddmedia_observer and sess.ddmedia_room == key) then return false; end
    local token = sess.ddmedia_pass;
    local req = token and prosody.ddmedia_inv_req and prosody.ddmedia_inv_req[token];
    if not (req and req.room == key) then return false; end
    local p = prosody.ddmedia_policy;
    local rule = p and p.data.rooms[key];
    local profile = p and p.data.profiles[sess.ddmedia_user];
    if not (rule and profile and profile.invisible == true) then return false; end
    for _, user in ipairs(rule.moderators) do
        if user == sess.ddmedia_user then return true; end
    end
    return false;
end

module:hook("muc-occupant-pre-join", function(event)
    local stanza = event.stanza;
    if not is_guest_session(stanza.attr.from) then return; end
    install_hide_filter(prosody.full_sessions[stanza.attr.from]);
    local room = event.room;
    if not rule_for(room) or not event.occupant then return; end
    local key = jid.node(room.jid):lower();
    if wants_invisible(event, key) then
        local bare = jid.bare(stanza.attr.from);
        prosody.ddmedia_hidden_nick[event.occupant.nick] = bare;
        prosody.ddmedia_invisible_bare[bare] = true;
        module:log("info", "moderador entra invisivel na sala %s", key);
    end
end, 95);

module:hook("muc-occupant-left", function(event)
    local occupant = event.occupant;
    if not occupant then return; end
    prosody.ddmedia_hidden_nick[occupant.nick] = nil;
    prosody.ddmedia_invisible_bare[occupant.bare_jid] = nil;
end, 5);

-- Invisivel nao escreve: mensagens de sala e privadas dele sao descartadas.
module:hook("muc-occupant-groupchat", function(event)
    local occupant = event.occupant;
    if occupant and prosody.ddmedia_invisible_bare[occupant.bare_jid] then return true; end
end, 100);
module:hook("muc-private-message", function(event)
    local from = event.stanza and event.stanza.attr.from;
    if from and prosody.ddmedia_invisible_bare[jid.bare(from)] then return true; end
end, 100);

prosody.ddmedia_room_started = prosody.ddmedia_room_started or {};
module:hook("muc-room-created", function(event)
    prosody.ddmedia_room_started[event.room.jid] = os.time();
end);
module:hook("muc-room-destroyed", function(event)
    prosody.ddmedia_room_started[event.room.jid] = nil;
    local name = jid.node(event.room.jid);
    if name then prosody.ddmedia_closed[name:lower()] = nil; end -- a reunião acabou: a sala volta a ser aberta
end);

module:log("info", "v1.11 carregado em %s", module.host);
