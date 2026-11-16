-- mod_ddmedia_admin_api.lua  (v1)
-- Canal INTERNO entre o painel (/settings) e o Prosody. O painel envia a política completa (salas e
-- moderadores) e o Prosody a valida, aplica e guarda no próprio volume.
--
-- Segurança (RULES §10):
--   * Só rede interna: a porta HTTP do Prosody (5280) não é publicada; o nginx do Jitsi só repassa
--     /http-bind e /xmpp-websocket, e o Traefik não aponta para o Prosody.
--   * Todo pedido é ASSINADO: HMAC-SHA256(segredo, "<timestamp>.<nonce>.<corpo>"), com tolerância
--     de relógio de 60 s e nonce de uso único (anti-replay). Comparação em tempo constante.
--   * O segredo fica num arquivo do servidor (ddmedia-admin.secret), nunca no código.
--   * Esquema ESTRITO: qualquer campo desconhecido, tipo errado ou limite excedido => 400 e a
--     política anterior continua valendo. Sem política válida o Prosody NEGA tudo (falha fechada).
--
-- Rotas (prefixo /ddmedia-admin):  POST /policy   GET /status   GET /users (nomes das contas)
--   GET /rooms (salas ativas agora, com participantes; somente leitura)
--   POST /session/grant (login feito pelo painel: confere a senha da conta e liga o segredo do navegador a ela)
-- Política (v3):
--   { "version": 3,
--     "settings": { "reconnect_pass_seconds": 900, "remember_seconds": 86400 },
--     "rooms": { "<sala>": { "kind": "permanent", "moderators": ["<usuario>", ...],
--                            "members": ["<usuario>", ...], "exclusive": false,
--                            "lobby": true } } }
--   moderators = entram direto, com privilégios; members = entram direto, sem privilégios;
--   exclusive  = só moderators/members entram (os demais são barrados, sem sala de espera).
--   lobby      = sala de espera de entrada (padrão true; false = quem entra, entra direto).
--   A v2 (sem members/exclusive) ainda é aceita e normalizada.

module:depends("http");

local json = require "util.json";
local hashes = require "util.hashes";
local bit = require "util.bitcompat";
local random = require "util.random"; -- operadores de bits em qualquer versao do Lua

local SECRET_FILE = module:get_option_string("ddmedia_admin_secret_file",
    "/prosody-plugins-custom/ddmedia-admin.secret");
local MAX_BODY = 256 * 1024;
local MAX_SKEW = 60;       -- segundos de tolerância de relógio
local NONCE_TTL = 300;     -- segundos que um nonce fica memorizado
local MAX_ROOMS = 500;
local MAX_MODERATORS = 50;
local MAX_MEMBERS = 500;

local ROOM_PATTERN = "^[a-z0-9][a-z0-9_-]*$";
local USER_PATTERN = "^[A-Za-z0-9._-]+$";

local store = module:open_store("ddmedia_policy");
local nonces = {};

local function read_secret()
    local f = io.open(SECRET_FILE, "r");
    if not f then return nil; end
    local s = f:read("*a");
    f:close();
    s = s and s:gsub("%s+$", "");
    if not s or #s < 32 then return nil; end
    return s;
end

local function constant_time_equal(a, b)
    if type(a) ~= "string" or type(b) ~= "string" or #a ~= #b then return false; end
    local diff = 0;
    for i = 1, #a do
        diff = bit.bor(diff, bit.bxor(a:byte(i), b:byte(i)));
    end
    return diff == 0;
end

local function prune_nonces(now)
    for k, exp in pairs(nonces) do
        if exp < now then nonces[k] = nil; end
    end
end

-- Confere a assinatura. Devolve true ou (false, motivo).
local function authenticate(request, body)
    local secret = read_secret();
    if not secret then return false, "segredo ausente"; end
    local h = request.headers;
    -- O Prosody normaliza nomes de cabecalho trocando "-" por "_" (x_timestamp); aceita as duas formas.
    local ts = tonumber(h["x_timestamp"] or h["x-timestamp"]);
    local nonce, sig = h["x_nonce"] or h["x-nonce"], h["x_signature"] or h["x-signature"];
    if not (ts and nonce and sig) or #nonce < 16 or #nonce > 128 or not nonce:match("^[%w_-]+$") then
        return false, "cabecalhos invalidos";
    end
    local now = os.time();
    if math.abs(now - ts) > MAX_SKEW then return false, "relogio fora da tolerancia"; end
    prune_nonces(now);
    if nonces[nonce] then return false, "nonce repetido"; end
    local expected = hashes.hmac_sha256(secret, ("%d.%s.%s"):format(ts, nonce, body), true);
    if not constant_time_equal(expected, sig:lower()) then return false, "assinatura invalida"; end
    nonces[nonce] = now + NONCE_TTL;
    return true;
end

local function is_int(v, min, max)
    return type(v) == "number" and v % 1 == 0 and v >= min and v <= max;
end

local function has_only(t, allowed)
    for k in pairs(t) do
        if not allowed[k] then return false, k; end
    end
    return true;
end

-- Lista de nomes de usuário: sequência, sem repetição, cada nome no padrão.
local function valid_user_list(list, max)
    if type(list) ~= "table" or #list > max then return false; end
    for k in pairs(list) do
        if type(k) ~= "number" then return false; end
    end
    local seen = {};
    for _, user in ipairs(list) do
        if type(user) ~= "string" or #user < 1 or #user > 64 or not user:match(USER_PATTERN) or seen[user] then
            return false;
        end
        seen[user] = true;
    end
    return true;
end

-- Valida o esquema inteiro. Devolve true ou (false, motivo).
local function validate(p)
    if type(p) ~= "table" then return false, "politica nao e objeto"; end
    local ok, bad = has_only(p, { version = true, settings = true, rooms = true, profiles = true });
    if not ok then return false, "campo desconhecido: " .. tostring(bad); end
    if p.version ~= 2 and p.version ~= 3 then return false, "versao invalida"; end

    local s = p.settings;
    if type(s) ~= "table" then return false, "settings ausente"; end
    ok, bad = has_only(s, { reconnect_pass_seconds = true, remember_seconds = true });
    if not ok then return false, "settings desconhecido: " .. tostring(bad); end
    if not is_int(s.reconnect_pass_seconds, 10, 86400) then return false, "reconnect_pass_seconds"; end
    if not is_int(s.remember_seconds, 300, 604800) then return false, "remember_seconds"; end

    -- Nome e foto de cada conta (o MUC impõe esses valores; ver mod_ddmedia_room_guard).
    if p.profiles ~= nil then
        if type(p.profiles) ~= "table" then return false, "profiles invalido"; end
        local n = 0;
        for user, prof in pairs(p.profiles) do
            n = n + 1;
            if n > 5000 then return false, "perfis demais"; end
            if type(user) ~= "string" or #user < 1 or #user > 64 or not user:match(USER_PATTERN) then return false, "perfil: usuario invalido"; end
            if type(prof) ~= "table" then return false, "perfil invalido"; end
            ok, bad = has_only(prof, { name = true, photo = true, invisible = true });
            if not ok then return false, "perfil: campo desconhecido " .. tostring(bad); end
            if type(prof.name) ~= "string" or #prof.name < 1 or #prof.name > 240 or prof.name:find("%c") then return false, "perfil: nome invalido"; end
            if prof.photo ~= nil and not is_int(prof.photo, 1, 2147483647) then return false, "perfil: foto invalida"; end
            if prof.invisible ~= nil and type(prof.invisible) ~= "boolean" then return false, "perfil: invisivel invalido"; end
        end
    end
    if type(p.rooms) ~= "table" then return false, "rooms ausente"; end
    local count = 0;
    for name, room in pairs(p.rooms) do
        count = count + 1;
        if count > MAX_ROOMS then return false, "salas demais"; end
        if type(name) ~= "string" or #name < 1 or #name > 64 or not name:match(ROOM_PATTERN) then
            return false, "nome de sala invalido";
        end
        if type(room) ~= "table" then return false, "sala invalida"; end
        ok, bad = has_only(room, { kind = true, expires_at = true, moderators = true, members = true, starters = true, exclusive = true, lobby = true, password = true });
        if not ok then return false, "campo desconhecido na sala: " .. tostring(bad); end
        if room.kind ~= "permanent" and room.kind ~= "temporary" then return false, "kind invalido"; end
        -- Sala temporária: prazo de existência (segundos Unix). Sala permanente não tem prazo.
        if room.kind == "temporary" then
            if not is_int(room.expires_at, 1, 4102444800) then return false, "expires_at invalido"; end
        elseif room.expires_at ~= nil then
            return false, "expires_at so vale em sala temporaria";
        end
        if not valid_user_list(room.moderators, MAX_MODERATORS) then return false, "moderadores invalidos"; end
        if room.members ~= nil and not valid_user_list(room.members, MAX_MEMBERS) then return false, "membros invalidos"; end
        if room.starters ~= nil and not valid_user_list(room.starters, MAX_MEMBERS) then return false, "iniciadores invalidos"; end
        if room.starters then
            local is_member = {};
            for _, user in ipairs(room.members or {}) do is_member[user] = true; end
            for _, user in ipairs(room.starters) do
                if not is_member[user] then return false, "iniciador fora dos membros"; end
            end
        end
        if room.exclusive ~= nil and type(room.exclusive) ~= "boolean" then return false, "exclusive invalido"; end
        if room.lobby ~= nil and type(room.lobby) ~= "boolean" then return false, "lobby invalido"; end
        if room.password ~= nil and type(room.password) ~= "boolean" then return false, "senha invalida"; end
        if p.version == 3 and (room.members == nil or room.exclusive == nil) then return false, "sala v3 incompleta"; end
        -- Ninguém pode estar nas duas listas (o nível de acesso seria ambíguo).
        local is_mod = {};
        for _, user in ipairs(room.moderators) do is_mod[user] = true; end
        for _, user in ipairs(room.members or {}) do
            if is_mod[user] then return false, "usuario em moderadores e membros"; end
        end
    end
    return true;
end

-- Política em memória (global: lida pelos módulos de autorização, em hosts diferentes).
local function activate(data, raw)
    data.profiles = data.profiles or {};
    -- Nomes que um convidado NAO pode usar (nome de exibicao e usuario de contas), em minusculas.
    local taken = {};
    for user, prof in pairs(data.profiles) do
        taken[(prof.name:lower():gsub("%s+", " "))] = true;
        taken[user:lower()] = true;
    end
    data.taken_names = taken;
    -- Normaliza a v2: sem membros e sem sala exclusiva.
    for _, room in pairs(data.rooms) do
        room.members = room.members or {};
        room.starters = room.starters or {};
        room.exclusive = room.exclusive or false;
        if room.lobby == nil then room.lobby = true; end
        -- "Sala com senha" nao vale em sala exclusiva (quem esta fora da lista e barrado de qualquer jeito).
        room.password = (room.password == true) and not room.exclusive;
    end
    prosody.ddmedia_policy = {
        data = data,
        hash = hashes.sha256(raw, true),
        at = os.time(),
    };
end

-- Ao carregar: restaura a última política VÁLIDA guardada (sobrevive a reinício do Prosody).
do
    local saved = store:get("current");
    if saved and type(saved.raw) == "string" then
        local ok, decoded = pcall(json.decode, saved.raw);
        if ok and validate(decoded) then
            activate(decoded, saved.raw);
            module:log("info", "politica restaurada (%d salas)", (function()
                local n = 0; for _ in pairs(decoded.rooms) do n = n + 1; end return n; end)());
        else
            module:log("warn", "politica guardada invalida; nenhuma politica ativa (nega tudo)");
        end
    else
        module:log("info", "sem politica guardada; nega tudo ate o painel enviar uma");
    end
end

local function reply(event, status, tbl)
    event.response.status_code = status;
    event.response.headers["Content-Type"] = "application/json";
    event.response.headers["Cache-Control"] = "no-store";
    return json.encode(tbl);
end

local function handle_policy(event)
    local request = event.request;
    local body = request.body or "";
    if #body > MAX_BODY then return reply(event, 413, { ok = false, error = "corpo grande demais" }); end

    local authed, why = authenticate(request, body);
    if not authed then
        module:log("warn", "POST /policy recusado: %s", why);
        return reply(event, 401, { ok = false, error = "nao autorizado" });
    end

    local parsed, decoded = pcall(json.decode, body);
    if not parsed then return reply(event, 400, { ok = false, error = "json invalido" }); end
    local valid, reason = validate(decoded);
    if not valid then
        module:log("warn", "politica recusada: %s", tostring(reason));
        return reply(event, 400, { ok = false, error = "esquema invalido: " .. tostring(reason) });
    end

    local saved, err = store:set("current", { raw = body, at = os.time() });
    if not saved then
        module:log("error", "falha ao guardar a politica: %s", tostring(err));
        return reply(event, 500, { ok = false, error = "falha ao guardar" });
    end
    activate(decoded, body);
    local n = 0;
    for _ in pairs(decoded.rooms) do n = n + 1; end
    module:log("info", "politica aplicada: %d salas, hash %s", n, prosody.ddmedia_policy.hash:sub(1, 12));
    return reply(event, 200, { ok = true, hash = prosody.ddmedia_policy.hash, rooms = n });
end

local function handle_status(event)
    local authed = authenticate(event.request, "");
    if not authed then return reply(event, 401, { ok = false, error = "nao autorizado" }); end
    local p = prosody.ddmedia_policy;
    return reply(event, 200, { ok = true, loaded = p ~= nil, hash = p and p.hash or nil, at = p and p.at or nil });
end

-- Lista os nomes das contas Jitsi (só nomes; nunca senhas ou dados de autenticação) para o painel
-- oferecer na hora de cadastrar moderadores. Somente leitura.
local usermanager = require "core.usermanager";
local MAX_USERS = 2000;
-- Contas internas do Jitsi/administrativas: nunca aparecem para o painel.
local SYSTEM_USERS = { focus = true, jvb = true, jibri = true, jigasi = true, admin = true, recorder = true, transcriber = true };

local function handle_users(event)
    local authed, why = authenticate(event.request, "");
    if not authed then
        module:log("warn", "GET /users recusado: %s", why);
        return reply(event, 401, { ok = false, error = "nao autorizado" });
    end
    local names = {};
    local okiter, err = pcall(function()
        for name in usermanager.users(module.host) do
            if #names >= MAX_USERS then break; end
            if type(name) == "string" and name:match(USER_PATTERN) and not SYSTEM_USERS[name] then names[#names + 1] = name; end
        end
    end);
    if not okiter then
        module:log("error", "falha ao listar contas: %s", tostring(err));
        return reply(event, 500, { ok = false, error = "falha ao listar" });
    end
    table.sort(names);
    return reply(event, 200, { ok = true, users = names });
end

-- ---------------------------------------------------------------------------------------------
-- Contas (Onda 3): criar, redefinir senha, apagar. Só o painel (assinatura HMAC) chama estas rotas.
-- A senha chega no corpo assinado, é entregue ao gerenciador de contas do Prosody (que guarda só o
-- hash) e NUNCA é registrada em log nem devolvida.
-- ---------------------------------------------------------------------------------------------
local NEW_USER_PATTERN = "^[a-z0-9][a-z0-9._-]*$";
local MIN_PASSWORD, MAX_PASSWORD = 12, 128;

-- Contas internas do Jitsi (Jicofo, JVB, Jibri, Jigasi) e administrativas: o painel nunca as toca.
local RESERVED = { focus = true, jvb = true, jibri = true, jigasi = true, admin = true, recorder = true, transcriber = true };

local function valid_new_username(u)
    return type(u) == "string" and #u >= 2 and #u <= 64 and u:match(NEW_USER_PATTERN) ~= nil and not RESERVED[u];
end

local function valid_password(p)
    if type(p) ~= "string" or #p < MIN_PASSWORD or #p > MAX_PASSWORD then return false; end
    if p:find("[%c]") then return false; end -- sem quebra de linha nem caracteres de controle
    return true;
end

-- Autentica, limita o tamanho, decodifica e confere o esquema ({username[, password]}).
-- Devolve tabela ou (nil, resposta HTTP já pronta).
local function read_account_request(event, needs_password)
    local body = event.request.body or "";
    if #body > 4096 then return nil, reply(event, 413, { ok = false, error = "corpo grande demais" }); end
    local authed, why = authenticate(event.request, body);
    if not authed then
        module:log("warn", "%s recusado: %s", event.request.path or "conta", why);
        return nil, reply(event, 401, { ok = false, error = "nao autorizado" });
    end
    local parsed, data = pcall(json.decode, body);
    if not parsed or type(data) ~= "table" then
        return nil, reply(event, 400, { ok = false, error = "json invalido" });
    end
    local allowed = { username = true, password = needs_password or nil };
    local ok_keys = has_only(data, allowed);
    if not ok_keys then return nil, reply(event, 400, { ok = false, error = "campo desconhecido" }); end
    if not valid_new_username(data.username) then
        return nil, reply(event, 400, { ok = false, error = "usuario invalido ou reservado" });
    end
    if needs_password and not valid_password(data.password) then
        return nil, reply(event, 400, { ok = false, error = "senha invalida (12 a 128 caracteres, sem controle)" });
    end
    return data;
end

local function handle_user_create(event)
    local data, resp = read_account_request(event, true);
    if not data then return resp; end
    if usermanager.user_exists(data.username, module.host) then
        return reply(event, 409, { ok = false, error = "usuario ja existe" });
    end
    local created, err = usermanager.create_user(data.username, data.password, module.host);
    if not created then
        module:log("error", "falha ao criar conta %s: %s", data.username, tostring(err));
        return reply(event, 500, { ok = false, error = "falha ao criar" });
    end
    module:log("info", "conta criada: %s", data.username);
    return reply(event, 200, { ok = true });
end

local function handle_user_password(event)
    local data, resp = read_account_request(event, true);
    if not data then return resp; end
    if not usermanager.user_exists(data.username, module.host) then
        return reply(event, 404, { ok = false, error = "usuario nao existe" });
    end
    local changed, err = usermanager.set_password(data.username, data.password, module.host);
    if not changed then
        module:log("error", "falha ao trocar senha de %s: %s", data.username, tostring(err));
        return reply(event, 500, { ok = false, error = "falha ao trocar a senha" });
    end
    module:log("info", "senha redefinida: %s", data.username);
    return reply(event, 200, { ok = true });
end

local function handle_user_delete(event)
    local data, resp = read_account_request(event, false);
    if not data then return resp; end
    if not usermanager.user_exists(data.username, module.host) then
        return reply(event, 404, { ok = false, error = "usuario nao existe" });
    end
    local deleted, err = usermanager.delete_user(data.username, module.host);
    if not deleted then
        module:log("error", "falha ao apagar conta %s: %s", data.username, tostring(err));
        return reply(event, 500, { ok = false, error = "falha ao apagar" });
    end
    module:log("info", "conta apagada: %s", data.username);
    return reply(event, 200, { ok = true });
end

-- ---------------------------------------------------------------------------------------------
-- Salas ativas (visao geral do painel). Somente leitura: lista as salas MUC abertas agora e quem
-- esta nelas (apelido, tipo e se e moderador). Nao expoe JIDs completos, IPs nem dados de sessao.
-- ---------------------------------------------------------------------------------------------
-- ---------------------------------------------------------------------------------------------
-- Login feito PELO PAINEL (antes de abrir o Jitsi). O painel recebe usuário e senha, repassa por aqui
-- (assinado) junto com o segredo do navegador (cookie __Host-ddpass, que o painel leu do cookie
-- HttpOnly). Se a senha confere, o segredo passa a valer como "navegador desta conta": no pedido de
-- conferência, o mod_ddmedia_focus_authz emite a sessão (moderador) ou marca a sessão (usuário comum)
-- ANTES de entrar na sala. A senha nunca é guardada nem registrada em log.
-- ---------------------------------------------------------------------------------------------
prosody.ddmedia_remembered = prosody.ddmedia_remembered or {};

local function handle_session_grant(event)
    local body = event.request.body or "";
    if #body > 4096 then return reply(event, 413, { ok = false, error = "corpo grande demais" }); end
    local authed, why = authenticate(event.request, body);
    if not authed then
        module:log("warn", "POST /session/grant recusado: %s", why);
        return reply(event, 401, { ok = false, error = "nao autorizado" });
    end
    local parsed, data = pcall(json.decode, body);
    if not parsed or type(data) ~= "table" or not has_only(data, { token = true, username = true, password = true }) then
        return reply(event, 400, { ok = false, error = "pedido invalido" });
    end
    local token = data.token;
    if type(token) ~= "string" or #token < 32 or #token > 128 or not token:match("^%x+$") then
        return reply(event, 400, { ok = false, error = "segredo invalido" });
    end
    if not valid_new_username(data.username) then return reply(event, 401, { ok = false, error = "credenciais invalidas" }); end
    if type(data.password) ~= "string" or #data.password < 1 or #data.password > MAX_PASSWORD then
        return reply(event, 401, { ok = false, error = "credenciais invalidas" });
    end
    if not usermanager.test_password(data.username, module.host, data.password) then
        module:log("info", "login pelo painel recusado: %s", data.username);
        return reply(event, 401, { ok = false, error = "credenciais invalidas" });
    end
    prosody.ddmedia_remembered[token] = { user = data.username, at = os.time() };
    module:log("info", "navegador ligado a conta %s (login pelo painel)", data.username);
    return reply(event, 200, { ok = true });
end

-- Quem e o navegador? (o painel pergunta, com o segredo HttpOnly que so ele le) Devolve so a conta, se o segredo valer.
local function handle_whoami(event)
    local body = event.request.body or "";
    if #body > 1024 then return reply(event, 413, { ok = false, error = "corpo grande demais" }); end
    local authed, why = authenticate(event.request, body);
    if not authed then
        module:log("warn", "POST /session/whoami recusado: %s", why);
        return reply(event, 401, { ok = false, error = "nao autorizado" });
    end
    local parsed, data = pcall(json.decode, body);
    if not parsed or type(data) ~= "table" or not has_only(data, { token = true }) then
        return reply(event, 400, { ok = false, error = "pedido invalido" });
    end
    local token = data.token;
    if type(token) ~= "string" or #token < 32 or #token > 128 or not token:match("^%x+$") then
        return reply(event, 400, { ok = false, error = "segredo invalido" });
    end
    local p = prosody.ddmedia_policy;
    local ttl = p and p.data.settings.remember_seconds or 86400;
    local rec = prosody.ddmedia_remembered[token];
    if not rec or os.time() - rec.at > ttl then return reply(event, 200, { ok = true, user = json.null }); end
    return reply(event, 200, { ok = true, user = rec.user });
end

local jid_split = require "util.jid".split;
local MUC_HOST = module:get_option_string("ddmedia_muc_host", "muc." .. module.host);
local MAX_LIVE_ROOMS, MAX_LIVE_OCCUPANTS = 200, 100;
-- Início da sessão de cada sala (preenchido pelo mod_ddmedia_room_guard; aqui é só o reserva).
prosody.ddmedia_room_started = prosody.ddmedia_room_started or {};
local NICK_XMLNS = "http://jabber.org/protocol/nick";
-- Reunião fechada (decidida por um moderador DENTRO da sala): sala (minúscula) -> true. Só vale enquanto
-- a sala existe; o mod_ddmedia_room_guard limpa a marca quando a sala acaba.
prosody.ddmedia_closed = prosody.ddmedia_closed or {};

local function occupant_info(occupant)
    local nick = "";
    local okp, presence = pcall(function() return occupant:get_presence(); end);
    if okp and presence then
        local text = presence:get_child_text("nick", NICK_XMLNS);
        if type(text) == "string" then nick = text:sub(1, 80); end
    end
    -- Com autenticação interna todo participante é anônimo no MUC; a conta real vem da sessão, marcada
    -- por mod_ddmedia_focus_authz (ddmedia_user / ddmedia_level) quando a conta tem acesso à sala.
    local user, level, starter;
    for real_jid in pairs(occupant.sessions or {}) do
        local sess = prosody.full_sessions[real_jid];
        if sess and sess.ddmedia_user and (sess.ddmedia_level == "moderator" or sess.ddmedia_level == "member") then
            user, level, starter = sess.ddmedia_user, sess.ddmedia_level, sess.ddmedia_starter;
            break;
        end
    end
    -- Contas internas (Jicofo, JVB, etc.) não são participantes.
    local node = jid_split(occupant.bare_jid or "");
    if not node or SYSTEM_USERS[node] then return nil; end
    return {
        name = nick,
        kind = user and "registered" or "guest",
        user = user,
        moderator = occupant.role == "moderator",
        level = level,
        interim = (starter and occupant.role == "moderator") or false,
        invisible = prosody.ddmedia_invisible_bare and prosody.ddmedia_invisible_bare[occupant.bare_jid] == true or false,
    };
end

local function handle_rooms(event)
    local authed, why = authenticate(event.request, "");
    if not authed then
        module:log("warn", "GET /rooms recusado: %s", why);
        return reply(event, 401, { ok = false, error = "nao autorizado" });
    end
    local host = prosody.hosts[MUC_HOST];
    local svc = host and host.modules and host.modules.muc;
    if not svc then return reply(event, 200, { ok = true, available = false, rooms = {} }); end

    local out = {};
    local okiter, err = pcall(function()
        local iter, a, b;
        if svc.live_rooms then iter, a, b = svc.live_rooms();
        elseif svc.each_room then iter, a, b = svc.each_room(true);
        else error("api de salas indisponivel"); end
        for room in iter, a, b do
            if #out >= MAX_LIVE_ROOMS then break; end
            local name = jid_split(room.jid);
            if type(name) == "string" and #name <= 128 then
                local people = {};
                for _, occupant in room:each_occupant() do
                    if #people >= MAX_LIVE_OCCUPANTS then break; end
                    local info = occupant_info(occupant);
                    if info then people[#people + 1] = info; end
                end
                local started = prosody.ddmedia_room_started[room.jid];
                if not started then
                    started = os.time(); -- sessão anterior ao módulo: conta a partir de agora
                    prosody.ddmedia_room_started[room.jid] = started;
                end
                out[#out + 1] = { name = name, started = started, closed = prosody.ddmedia_closed[name:lower()] == true, participants = people };
            end
        end
    end);
    if not okiter then
        module:log("error", "falha ao listar salas ativas: %s", tostring(err));
        return reply(event, 200, { ok = true, available = false, rooms = {} });
    end
    return reply(event, 200, { ok = true, available = true, rooms = out });
end

-- Procura uma sala ativa pelo nome (as salas ativas são poucas: no máximo MAX_LIVE_ROOMS).
local function find_live_room(name)
    local host = prosody.hosts[MUC_HOST];
    local svc = host and host.modules and host.modules.muc;
    if not svc then return nil; end
    local found;
    pcall(function()
        local iter, a, b;
        if svc.live_rooms then iter, a, b = svc.live_rooms(); else iter, a, b = svc.each_room(true); end
        for room in iter, a, b do
            local n = jid_split(room.jid);
            if type(n) == "string" and n:lower() == name then found = room; break; end
        end
    end);
    return found;
end

-- Reunião fechada: consulta/altera. Quem chama é o painel (assinado), em nome do navegador (segredo
-- __Host-ddpass). Só um MODERADOR CADASTRADO NA SALA, ligado a esse segredo, pode alterar; qualquer
-- outro recebe "moderator = false" e nada muda. Sem "closed" no pedido, só consulta.
local function handle_room_closed(event)
    local body = event.request.body or "";
    if #body > 1024 then return reply(event, 413, { ok = false, error = "corpo grande demais" }); end
    local authed, why = authenticate(event.request, body);
    if not authed then
        module:log("warn", "POST /room/closed recusado: %s", why);
        return reply(event, 401, { ok = false, error = "nao autorizado" });
    end
    local parsed, data = pcall(json.decode, body);
    if not parsed or type(data) ~= "table" or not has_only(data, { token = true, room = true, closed = true }) then
        return reply(event, 400, { ok = false, error = "pedido invalido" });
    end
    local token, room = data.token, data.room;
    if type(token) ~= "string" or #token < 32 or #token > 128 or not token:match("^%x+$") then
        return reply(event, 400, { ok = false, error = "segredo invalido" });
    end
    if type(room) ~= "string" or #room > 64 or not room:match(ROOM_PATTERN) then
        return reply(event, 400, { ok = false, error = "sala invalida" });
    end
    if data.closed ~= nil and type(data.closed) ~= "boolean" then
        return reply(event, 400, { ok = false, error = "valor invalido" });
    end

    local p = prosody.ddmedia_policy;
    local rule = p and p.data.rooms[room];
    local rec = prosody.ddmedia_remembered[token];
    local ttl = p and p.data.settings.remember_seconds or 86400;
    local is_moderator = false;
    if rec and rule and os.time() - rec.at <= ttl then
        for _, user in ipairs(rule.moderators) do
            if user == rec.user then is_moderator = true; break; end
        end
    end
    local live_room = find_live_room(room);
    -- Moderador INTERINO em exercício (conta listada como interina que é moderadora na sala agora) também vale.
    if not is_moderator and rec and rule and live_room and os.time() - rec.at <= ttl then
        local is_starter = false;
        for _, user in ipairs(rule.starters or {}) do
            if user == rec.user then is_starter = true; break; end
        end
        if is_starter then
            for _, occupant in live_room:each_occupant() do
                if occupant.role == "moderator" then
                    for real_jid in pairs(occupant.sessions or {}) do
                        local sess = prosody.full_sessions[real_jid];
                        if sess and sess.ddmedia_user == rec.user and sess.ddmedia_starter then is_moderator = true; end
                    end
                end
            end
        end
    end
    if not is_moderator then return reply(event, 200, { ok = true, moderator = false }); end

    local live = live_room ~= nil;
    if data.closed == nil then
        return reply(event, 200, { ok = true, moderator = true, live = live, closed = prosody.ddmedia_closed[room] == true });
    end
    if not live then return reply(event, 409, { ok = false, error = "sala sem reuniao" }); end
    prosody.ddmedia_closed[room] = data.closed or nil;
    module:log("info", "reuniao %s: %s por %s", data.closed and "FECHADA" or "ABERTA", room, rec.user);
    prosody.events.fire_event("ddmedia-room-closed", { room = room });
    return reply(event, 200, { ok = true, moderator = true, live = true, closed = data.closed });
end

-- ------------------------------------------------------------------------------------------------
-- Sala com senha e Modo invisivel (Onda 9). Estado so em memoria; a politica (painel) e a fonte da verdade.
-- ------------------------------------------------------------------------------------------------
local PASS_ROTATE = 600;                                  -- a senha da sala troca a cada 10 min (sem tolerancia)
local PASS_ENTRY_SECONDS = 90;                            -- depois de acertar a senha, ha 90 s para a pessoa entrar
local PASS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; -- 32 simbolos, sem caracteres ambiguos (0/O, 1/I)
prosody.ddmedia_roompass = prosody.ddmedia_roompass or {};      -- sala -> { pass, at }
prosody.ddmedia_entry = prosody.ddmedia_entry or {};            -- sala -> segredo do navegador -> prazo
prosody.ddmedia_inv_req = prosody.ddmedia_inv_req or {};        -- segredo do navegador -> { room, at }
prosody.ddmedia_invisible_bare = prosody.ddmedia_invisible_bare or {};
prosody.ddmedia_pw_attempts = prosody.ddmedia_pw_attempts or {};

local function new_password()
    local bytes = random.bytes(8);
    local out = {};
    for i = 1, 8 do
        local n = bytes:byte(i) % 32 + 1;
        out[i] = PASS_ALPHABET:sub(n, n);
    end
    return table.concat(out);
end

-- A regra de senha so existe se a sala a liga (e nao e exclusiva).
local function password_rule(name)
    local p = prosody.ddmedia_policy;
    local rule = p and p.data.rooms[name];
    if rule and rule.password == true and not rule.exclusive then return rule; end
    return nil;
end

-- Senha vigente da sala: so existe enquanto ha reunião; troca a cada PASS_ROTATE segundos; some quando a reunião acaba
-- ou a opcao e desligada.
local function current_password(name)
    local roompass = prosody.ddmedia_roompass;
    if not password_rule(name) or not find_live_room(name) then
        roompass[name] = nil;
        prosody.ddmedia_entry[name] = nil;
        return nil;
    end
    local rec = roompass[name];
    local now = os.time();
    if not rec or now - rec.at >= PASS_ROTATE then
        rec = { pass = new_password(), at = now };
        roompass[name] = rec;
        module:log("info", "senha da sala %s trocada", name);
    end
    return rec;
end

-- Limite de tentativas: lista de instantes por chave, janela deslizante.
local function attempts_exceeded(key, max, window)
    local list = prosody.ddmedia_pw_attempts[key];
    if not list then return false; end
    local now, kept = os.time(), {};
    for _, t in ipairs(list) do
        if now - t < window then kept[#kept + 1] = t; end
    end
    prosody.ddmedia_pw_attempts[key] = kept;
    return #kept >= max;
end
local function note_attempt(key)
    local list = prosody.ddmedia_pw_attempts[key] or {};
    list[#list + 1] = os.time();
    prosody.ddmedia_pw_attempts[key] = list;
end

-- Limpeza periodica: senha de sala que acabou, prazos de entrada vencidos, pedidos de invisibilidade antigos.
module:add_timer(5, function()
    local now = os.time();
    for name in pairs(prosody.ddmedia_roompass) do current_password(name); end
    for name, entry in pairs(prosody.ddmedia_entry) do
        for token, exp in pairs(entry) do
            if now > exp then entry[token] = nil; end
        end
        if next(entry) == nil then prosody.ddmedia_entry[name] = nil; end
    end
    for token, req in pairs(prosody.ddmedia_inv_req) do
        if now - req.at > 6 * 3600 then prosody.ddmedia_inv_req[token] = nil; end
    end
    for key, list in pairs(prosody.ddmedia_pw_attempts) do
        local kept = {};
        for _, t in ipairs(list) do
            if now - t < 600 then kept[#kept + 1] = t; end
        end
        if #kept == 0 then prosody.ddmedia_pw_attempts[key] = nil; else prosody.ddmedia_pw_attempts[key] = kept; end
    end
    return 5;
end);

-- Le {token, room, ...} de um pedido assinado do painel. Devolve (dados, nil) ou (nil, resposta de erro).
local function read_token_request(event, allowed)
    local body = event.request.body or "";
    if #body > 1024 then return nil, reply(event, 413, { ok = false, error = "corpo grande demais" }); end
    local authed, why = authenticate(event.request, body);
    if not authed then
        module:log("warn", "%s recusado: %s", event.request.path or "pedido", why);
        return nil, reply(event, 401, { ok = false, error = "nao autorizado" });
    end
    local parsed, data = pcall(json.decode, body);
    if not parsed or type(data) ~= "table" or not has_only(data, allowed) then
        return nil, reply(event, 400, { ok = false, error = "pedido invalido" });
    end
    if type(data.token) ~= "string" or #data.token < 32 or #data.token > 128 or not data.token:match("^%x+$") then
        return nil, reply(event, 400, { ok = false, error = "segredo invalido" });
    end
    if type(data.room) ~= "string" or #data.room > 64 or not data.room:match(ROOM_PATTERN) then
        return nil, reply(event, 400, { ok = false, error = "sala invalida" });
    end
    return data;
end

-- Este navegador (segredo) e de um moderador DA SALA? (cadastrado como moderador, ou interino em exercicio).
-- Devolve: e_moderador, registro_da_sessao, regra_da_sala.
local function moderator_of(token, room)
    local p = prosody.ddmedia_policy;
    local rule = p and p.data.rooms[room];
    local rec = prosody.ddmedia_remembered[token];
    local ttl = p and p.data.settings.remember_seconds or 86400;
    if not (rec and rule and os.time() - rec.at <= ttl) then return false, nil, rule; end
    for _, user in ipairs(rule.moderators) do
        if user == rec.user then return true, rec, rule; end
    end
    local is_starter = false;
    for _, user in ipairs(rule.starters or {}) do
        if user == rec.user then is_starter = true; break; end
    end
    local live_room = is_starter and find_live_room(room);
    if live_room then
        for _, occupant in live_room:each_occupant() do
            if occupant.role == "moderator" then
                for real_jid in pairs(occupant.sessions or {}) do
                    local sess = prosody.full_sessions[real_jid];
                    if sess and sess.ddmedia_user == rec.user and sess.ddmedia_starter then return true, rec, rule; end
                end
            end
        end
    end
    return false, rec, rule;
end

-- Senha da sala para o MODERADOR (ver e copiar no menu da sala). Quem nao e moderador da sala nunca recebe a senha.
local function handle_room_password(event)
    local data, resp = read_token_request(event, { token = true, room = true });
    if not data then return resp; end
    local is_mod = moderator_of(data.token, data.room);
    if not is_mod then return reply(event, 200, { ok = true, moderator = false }); end
    if not password_rule(data.room) then return reply(event, 200, { ok = true, moderator = true, enabled = false }); end
    local rec = current_password(data.room);
    if not rec then return reply(event, 200, { ok = true, moderator = true, enabled = true, live = false }); end
    local left = PASS_ROTATE - (os.time() - rec.at);
    if left < 0 then left = 0; end
    return reply(event, 200, { ok = true, moderator = true, enabled = true, live = true, password = rec.pass, rotates_in = left });
end

-- Convidado digitou a senha: se estiver certa (e vigente AGORA), o navegador ganha 60 s para entrar direto, sem sala de espera.
local function handle_room_password_redeem(event)
    local data, resp = read_token_request(event, { token = true, room = true, password = true });
    if not data then return resp; end
    if type(data.password) ~= "string" or #data.password < 1 or #data.password > 40 then
        return reply(event, 400, { ok = false, error = "senha invalida" });
    end
    local room, token = data.room, data.token;
    if not password_rule(room) then return reply(event, 200, { ok = true, granted = false, reason = "indisponivel" }); end
    if prosody.ddmedia_closed[room] then return reply(event, 200, { ok = true, granted = false, reason = "fechada" }); end
    local rec = current_password(room);
    if not rec then return reply(event, 200, { ok = true, granted = false, reason = "sem_reuniao" }); end
    if attempts_exceeded("t:" .. token, 6, 600) or attempts_exceeded("r:" .. room, 40, 600) then
        module:log("warn", "muitas tentativas de senha na sala %s", room);
        return reply(event, 429, { ok = false, error = "muitas tentativas" });
    end
    local typed = data.password:upper():gsub("[%s%-]", "");
    if not constant_time_equal(typed, rec.pass) then
        note_attempt("t:" .. token);
        note_attempt("r:" .. room);
        return reply(event, 200, { ok = true, granted = false, reason = "senha" });
    end
    prosody.ddmedia_entry[room] = prosody.ddmedia_entry[room] or {};
    prosody.ddmedia_entry[room][token] = os.time() + PASS_ENTRY_SECONDS;
    module:log("info", "senha da sala %s aceita: entrada direta liberada por %d s", room, PASS_ENTRY_SECONDS);
    return reply(event, 200, { ok = true, granted = true });
end

-- Modo invisivel: so MODERADOR REAL da sala (listado), com a opcao ligada na conta, pode pedir. O pedido fica ligado ao
-- segredo do navegador e vale para a proxima entrada nessa sala. Sem "on", so consulta.
local function handle_invisible(event)
    local data, resp = read_token_request(event, { token = true, room = true, on = true });
    if not data then return resp; end
    if data.on ~= nil and type(data.on) ~= "boolean" then return reply(event, 400, { ok = false, error = "valor invalido" }); end
    local p = prosody.ddmedia_policy;
    local rec = prosody.ddmedia_remembered[data.token];
    local rule = p and p.data.rooms[data.room];
    local ttl = p and p.data.settings.remember_seconds or 86400;
    local available = false;
    if rec and rule and os.time() - rec.at <= ttl then
        local profile = p.data.profiles[rec.user];
        if profile and profile.invisible == true then
            for _, user in ipairs(rule.moderators) do
                if user == rec.user then available = true; break; end
            end
        end
    end
    if data.on == false or (data.on == true and not available) then prosody.ddmedia_inv_req[data.token] = nil; end
    if data.on == true and available then prosody.ddmedia_inv_req[data.token] = { room = data.room, at = os.time() }; end
    local req = prosody.ddmedia_inv_req[data.token];
    return reply(event, 200, { ok = true, available = available, on = available and req ~= nil and req.room == data.room });
end

module:provides("http", {
    default_path = "ddmedia-admin";
    route = {
        ["POST /policy"] = handle_policy;
        ["GET /status"] = handle_status;
        ["GET /users"] = handle_users;
        ["GET /rooms"] = handle_rooms;
        ["POST /session/grant"] = handle_session_grant;
        ["POST /room/closed"] = handle_room_closed;
        ["POST /room/password"] = handle_room_password;
        ["POST /room/password/redeem"] = handle_room_password_redeem;
        ["POST /session/invisible"] = handle_invisible;
        ["POST /session/whoami"] = handle_whoami;
        ["POST /users"] = handle_user_create;
        ["POST /users/password"] = handle_user_password;
        ["POST /users/delete"] = handle_user_delete;
    };
});

module:log("info", "v1.11 carregado em %s", module.host);
