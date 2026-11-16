#!/usr/bin/env python3
"""
Prepara os arquivos de UMA instalação a partir dos modelos de `infra/`.

    python tools/render_templates.py install.values

- Lê `install.values` (copie de `install.values.example`): domínio, IP, fuso, nome da marca e os uuids do Coolify
  (estes só existem depois de criar cada recurso; rode o script de novo a cada etapa).
- Na PRIMEIRA execução gera os segredos da instalação em `build/secrets.env` e os REAPROVEITA nas seguintes
  (as senhas precisam ser iguais entre serviços). Não apague esse arquivo durante a instalação.
- Escreve tudo em `build/` (fora do Git). Um modelo cujo marcador ainda não tem valor é PULADO, com aviso;
  nenhum arquivo sai com marcador sobrando.
- Módulos do Prosody: versão sem comentários e só ASCII (é a forma usada no servidor; o conteúdo dos
  "file storages" do Coolify é enviado assim).

Saída (build/):
  jitsi/docker-compose.yml, jitsi/jitsi.env            -> serviço do Jitsi
  prosody/*.lua, prosody/ddmedia-admin.secret          -> file storages do contêiner prosody (/prosody-plugins-custom/)
  jibri/docker-compose.yml, jibri/jibri.env,
  jibri/ddmedia-finalize.sh, jibri/ddmedia-web-proxy.conf -> serviço do gravador
  traefik/jitsi-flow.yaml                              -> Dynamic Configuration do proxy
  panel/panel.env                                      -> variáveis do app do painel
  db/db.env                                            -> senha do dono do banco (usada ao criar o banco)
"""
import os
import re
import secrets
import sys
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INFRA = os.path.join(ROOT, "infra")
BUILD = os.path.join(ROOT, "build")
PLACEHOLDER = re.compile(r"\{\{([A-Z0-9_]+)\}\}")

# Segredos gerados uma vez por instalação (hex de 64 caracteres = 256 bits).
SECRET_KEYS = [
    "JVB_AUTH_PASSWORD", "JICOFO_AUTH_PASSWORD", "JICOFO_COMPONENT_SECRET",
    "JIBRI_XMPP_PASSWORD", "JIBRI_RECORDER_PASSWORD", "JIGASI_XMPP_PASSWORD", "JIGASI_TRANSCRIBER_PASSWORD",
    "PROSODY_ADMIN_SECRET", "RECORDING_INGEST_SECRET", "BETTER_AUTH_SECRET",
    "DB_OWNER_PASSWORD", "APP_DB_PASSWORD", "SETUP_TOKEN",
]
# Valores obrigatórios por modelo (além dos segredos).
REQUIRED = ["DOMAIN", "PUBLIC_IP", "TZ", "BRAND_NAME"]
# Opcionais do painel: vazios desligam o recurso (e-mail, transcrição, reinício do gravador pelo painel).
PANEL_OPTIONAL = ["RESEND_API_KEY", "MAIL_FROM", "GEMINI_API_KEY", "COOLIFY_URL", "COOLIFY_API_TOKEN", "JIBRI_SERVICE_UUID"]


def read_kv(path):
    out = {}
    if not os.path.exists(path):
        return out
    for raw in open(path, encoding="utf-8"):
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def write(path, text, mode=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    if mode:
        os.chmod(path, mode)


def render(text, values, name, optional=()):
    missing = sorted({m for m in PLACEHOLDER.findall(text) if not values.get(m) and m not in optional})
    if missing:
        print(f"  PULADO {name}: falta {', '.join(missing)}")
        return None
    return PLACEHOLDER.sub(lambda m: values.get(m.group(1), ""), text)


def strip_lua(text):
    repl = {"§": "par.", "→": "->", "…": "...", "–": "-", "—": "-", "“": '"', "”": '"', "’": "'", "≥": ">=", "≤": "<=", "×": "x"}
    text = text.replace("\r\n", "\n")
    for k, v in repl.items():
        text = text.replace(k, v)
    lines = []
    for line in text.split("\n"):
        if line.strip().startswith("--"):
            continue
        # comentário no fim da linha: só remove quando o "--" não está dentro de aspas
        m = re.match(r'^((?:[^"\']|"[^"]*"|\'[^\']*\')*?)\s+--\s.*$', line)
        if m:
            line = m.group(1)
        if not line.strip():
            continue
        lines.append(line.rstrip())
    body = "\n".join(lines) + "\n"
    return unicodedata.normalize("NFKD", body).encode("ascii", "ignore").decode("ascii")


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    values = read_kv(sys.argv[1])
    for k in REQUIRED:
        if not values.get(k):
            sys.exit(f"ERRO: {k} vazio em {sys.argv[1]}")
    if not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", values["DOMAIN"]):
        sys.exit("ERRO: DOMAIN deve ser só o nome (ex.: meet.cliente.com.br), sem https:// e sem barra")

    secrets_path = os.path.join(BUILD, "secrets.env")
    saved = read_kv(secrets_path)
    for k in SECRET_KEYS:
        if not saved.get(k):
            saved[k] = secrets.token_hex(32)
    write(secrets_path, "# Segredos DESTA instalação. Não versionar, não reutilizar em outro cliente.\n"
          + "".join(f"{k}={saved[k]}\n" for k in SECRET_KEYS), 0o600)
    values = {**saved, **values}
    print(f"segredos: {secrets_path}")

    # Jitsi
    write(os.path.join(BUILD, "jitsi", "docker-compose.yml"), open(os.path.join(INFRA, "jitsi", "docker-compose.yml"), encoding="utf-8").read())
    env_tpl = open(os.path.join(INFRA, "jitsi", "jitsi.env.template"), encoding="utf-8").read()
    out_lines = []
    for line in env_tpl.splitlines():
        if line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if v == "{{GERAR}}":
            v = values[k]
        out_lines.append(f"{k}={v}")
    jitsi_env = render("\n".join(out_lines) + "\n", values, "jitsi/jitsi.env")
    if jitsi_env:
        write(os.path.join(BUILD, "jitsi", "jitsi.env"), jitsi_env, 0o600)

    # Prosody
    pdir = os.path.join(INFRA, "prosody")
    for name in sorted(os.listdir(pdir)):
        if name.endswith(".lua"):
            write(os.path.join(BUILD, "prosody", name), strip_lua(open(os.path.join(pdir, name), encoding="utf-8").read()))
    write(os.path.join(BUILD, "prosody", "ddmedia-admin.secret"), values["PROSODY_ADMIN_SECRET"] + "\n", 0o600)

    # Gravador
    for name in ["docker-compose.yml", "ddmedia-finalize.sh", "ddmedia-web-proxy.conf"]:
        text = render(open(os.path.join(INFRA, "jibri", name), encoding="utf-8").read(), values, f"jibri/{name}")
        if text:
            write(os.path.join(BUILD, "jibri", name), text)
    write(os.path.join(BUILD, "jibri", "jibri.env"),
          f"JIBRI_XMPP_PASSWORD={values['JIBRI_XMPP_PASSWORD']}\n"
          f"JIBRI_RECORDER_PASSWORD={values['JIBRI_RECORDER_PASSWORD']}\n"
          f"DDMEDIA_INGEST_SECRET={values['RECORDING_INGEST_SECRET']}\n", 0o600)

    # Traefik
    text = render(open(os.path.join(INFRA, "traefik", "jitsi-flow.yaml"), encoding="utf-8").read(), values, "traefik/jitsi-flow.yaml")
    if text:
        write(os.path.join(BUILD, "traefik", "jitsi-flow.yaml"), text)

    # Banco
    write(os.path.join(BUILD, "db", "db.env"), f"POSTGRES_USER=panel\nPOSTGRES_DB=panel\nPOSTGRES_PASSWORD={values['DB_OWNER_PASSWORD']}\n", 0o600)

    # Painel
    env_tpl = open(os.path.join(INFRA, "panel", "panel.env.template"), encoding="utf-8").read()
    text = render("\n".join(l for l in env_tpl.splitlines() if l and not l.startswith("#")) + "\n", values, "panel/panel.env", PANEL_OPTIONAL)
    if text:
        # Variáveis opcionais sem valor ficam de fora (o painel desliga o recurso correspondente).
        text = "".join(l + "\n" for l in text.splitlines() if not l.endswith("="))
        write(os.path.join(BUILD, "panel", "panel.env"), text, 0o600)

    left = []
    for dirpath, _, files in os.walk(BUILD):
        for f in files:
            if PLACEHOLDER.search(open(os.path.join(dirpath, f), encoding="utf-8").read()):
                left.append(os.path.relpath(os.path.join(dirpath, f), BUILD))
    if left:
        sys.exit(f"ERRO: marcador sobrando em {left}")
    print("ok: build/ atualizado")


if __name__ == "__main__":
    main()
