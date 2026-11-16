-- mod_ddmedia_recording_guard.lua  (v1.1)
-- Gravacao e transmissao so por MODERADOR REAL da sala. O pedido de iniciar/parar vai ao Jicofo como um IQ <jibri .../>
-- (http://jitsi.org/protocol/jibri), enderecado ao ocupante "focus" da SALA (sala@muc/focus), nao ao host focus.<dominio>.
-- Aqui ele so passa se a sessao for de uma conta moderadora real DESTA sala (marca posta pelo mod_ddmedia_focus_authz:
-- ddmedia_level = "moderator"). Interino, usuario comum, convidado e observador invisivel sao negados, mesmo por comando direto.
--
-- Carregar nos mesmos hosts do focus_authz (GLOBAL_MODULES=ddmedia_focus_authz,ddmedia_recording_guard).

if module:get_host_type() ~= "local" then return; end

local st = require "util.stanza";
local jid_split = require "util.jid".split;

local JIBRI_NS = "http://jitsi.org/protocol/jibri";
local base_domain = module:get_option_string("muc_mapper_domain_base");
if not base_domain then return; end

local is_auth_host = (module.host == base_domain);
local is_guest_host = (module.host:sub(1, 6) == "guest.");
if not (is_auth_host or is_guest_host) then return; end

local function guard(event)
    local origin, stanza = event.origin, event.stanza;
    if stanza.attr.type ~= "set" or stanza.ddmedia_internal then return; end
    local jibri = stanza:get_child("jibri", JIBRI_NS);
    if not jibri then return; end

    local allowed = false;
    -- So a sessao do participante (host dos convidados) pede gravacao; a conexao de login da conta nunca.
    if is_guest_host and origin.ddmedia_level == "moderator" and not origin.ddmedia_observer and origin.ddmedia_room then
        local node = jid_split(jibri.attr.room or "") or jid_split(stanza.attr.to or "");
        allowed = (node == nil) or (node:lower() == origin.ddmedia_room);
    end
    if allowed then return; end

    module:log("warn", "NEGA gravacao (%s) para a sessao %s: so moderador real da sala",
        tostring(jibri.attr.action), tostring(origin.full_jid or origin.username));
    origin.send(st.error_reply(stanza, "auth", "forbidden", "gravacao so por moderador"));
    return true;
end

-- O destino pode ser o host do Jicofo, a sala (bare) ou o ocupante da sala (full): cobre os tres.
module:hook("pre-iq/host", guard, 20);
module:hook("pre-iq/bare", guard, 20);
module:hook("pre-iq/full", guard, 20);

module:log("info", "v1.1 carregado em %s (%s)", module.host, is_auth_host and "contas" or "convidados");
