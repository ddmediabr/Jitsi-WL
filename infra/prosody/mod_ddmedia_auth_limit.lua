-- mod_ddmedia_auth_limit.lua  (v1)
-- Limite de tentativas de LOGIN XMPP (SASL) no host de contas (pentest de 2026-11-15: chute ilimitado de senha
-- pela conexão direta, ~5 tentativas por segundo). O login normal das pessoas é feito pelo painel
-- (`/session/grant`, que já tem limite próprio); pelo XMPP direto só deveria entrar o próprio Jitsi.
--
--   * Por conta: 5 senhas erradas em 5 minutos bloqueiam aquela conta por 15 minutos (mesmo com a senha certa).
--   * Por IP: 30 erros em 5 minutos bloqueiam o IP por 15 minutos.
--   * Durante o bloqueio a resposta é `temporary-auth-failure` (não diz se a senha estava certa).
--   * Não age nos hosts internos (`auth.`: Jicofo/JVB/Jibri; `recorder.`/`hidden.`) nem no de convidados (`guest.`).
--
-- Carregar em GLOBAL_MODULES (o módulo se desliga sozinho onde não deve agir).

if module:get_host_type() ~= "local" then return; end
local h = module.host;
if h:sub(1, 5) == "auth." or h:sub(1, 6) == "guest." or h:sub(1, 9) == "recorder." or h:sub(1, 7) == "hidden." then
    return;
end

local st = require "util.stanza";
local base64 = require "util.encodings".base64;

local WINDOW, BLOCK = 300, 900;
local MAX_USER, MAX_IP = 5, 30;
local SASL = "urn:ietf:params:xml:ns:xmpp-sasl";
local fails = {}; -- chave -> { count, first, blocked_until }

local function blocked(key)
    local f = fails[key];
    if not f then return false; end
    local now = os.time();
    if f.blocked_until and now < f.blocked_until then return true; end
    if now - f.first > WINDOW then fails[key] = nil; end
    return false;
end

local function add_failure(key, max)
    local now = os.time();
    local f = fails[key];
    if not f or now - f.first > WINDOW then f = { count = 0, first = now }; fails[key] = f; end
    f.count = f.count + 1;
    if f.count >= max then f.blocked_until = now + BLOCK; end
end

-- Usuário pedido no primeiro passo do SASL (PLAIN: "\0usuario\0senha"; SCRAM: "n,,n=usuario,r=...").
local function user_of(stanza)
    local data = stanza:get_text();
    if not data or data == "" or data == "=" then return nil; end
    local raw = base64.decode(data);
    if not raw then return nil; end
    local mech = stanza.attr.mechanism or "";
    local user;
    if mech == "PLAIN" then
        user = raw:match("^[^%z]*%z([^%z]+)%z");
    elseif mech:match("^SCRAM%-") then
        user = raw:match("n=([^,]+)");
    end
    return user and user:lower() or nil;
end

module:hook("stanza/" .. SASL .. ":auth", function(event)
    local session, stanza = event.origin, event.stanza;
    local user = user_of(stanza);
    session.ddmedia_auth_user = user;
    if (user and blocked("u:" .. user)) or (session.ip and blocked("i:" .. session.ip)) then
        module:log("warn", "login bloqueado temporariamente (conta %s, ip %s)", tostring(user), tostring(session.ip));
        session.send(st.stanza("failure", { xmlns = SASL }):tag("temporary-auth-failure"));
        return true;
    end
end, 500);

module:hook("authentication-failure", function(event)
    local session = event.session;
    if session.ddmedia_auth_user then add_failure("u:" .. session.ddmedia_auth_user, MAX_USER); end
    if session.ip then add_failure("i:" .. session.ip, MAX_IP); end
end);

module:hook("authentication-success", function(event)
    local session = event.session;
    if session.ddmedia_auth_user then fails["u:" .. session.ddmedia_auth_user] = nil; end
end);

-- Limpeza periódica (a tabela não cresce sem limite).
module:add_timer(60, function()
    local now = os.time();
    for k, f in pairs(fails) do
        if (not f.blocked_until or now >= f.blocked_until) and now - f.first > WINDOW then fails[k] = nil; end
    end
    return 60;
end);

module:log("info", "v1 carregado em %s (conta: %d erros/%ds, ip: %d erros/%ds, bloqueio %ds)", h, MAX_USER, WINDOW, MAX_IP, WINDOW, BLOCK);
