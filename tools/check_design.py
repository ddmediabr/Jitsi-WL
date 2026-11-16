#!/usr/bin/env python3
"""
Garante que o DESIGN do painel é o de referência (regra número 1 do repositório).

    python tools/check_design.py            confere: sai com 0 se nada mudou, com 1 se algum arquivo de design mudou
    python tools/check_design.py --update   regrava docs/design.lock (SÓ quando o design de REFERÊNCIA mudou de propósito,
                                            no mesmo commit da mudança e com aviso ao dono do produto)

O que entra na assinatura (tudo o que define o visual, os textos fixos e as animações):
  panel/src/app/**/*.tsx|css|ico  telas e estilos globais (globals.css = tokens, cores, curvas, animações) e o favicon padrão
  panel/src/components/**         componentes e telas de fluxo
  panel/src/lib/<design>.ts|tsx   paleta, cores, tema, movimento, fundo da entrada, textos de saída, hall, marca, e-mails e a
                                  ponte com a interface do Jitsi (jitsi.ts)
  panel/public/**                 imagens e vídeos de apoio (presets de fundo, robô)
  panel/components.json           configuração do shadcn (estilo base-nova)

As quebras de linha são normalizadas (CRLF = LF), então o resultado é o mesmo no Windows e no Linux.
O que o cliente muda (nome, logos, favicon, cores, textos) fica no BANCO, em Personalização, e não passa por aqui.
"""
import hashlib
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOCK = os.path.join(ROOT, "docs", "design.lock")
PANEL = os.path.join(ROOT, "panel")

LIB_FILES = [
    "accent.ts", "palette.ts", "theme.ts", "entry-bg.ts", "entry-presets.ts", "entry-preset-list.ts",
    "exit-texts.ts", "hall.ts", "brand.ts", "mail-template.ts", "nav.ts", "notify.ts", "recent-rooms.ts", "utils.ts",
    "motion.tsx", "jitsi.ts",
]
TREES = [
    ("src/app", (".tsx", ".css", ".ico", ".png", ".svg", ".webp", ".jpg")),
    ("src/components", None),
    ("public", None),
]


def files():
    out = []
    for sub, exts in TREES:
        base = os.path.join(PANEL, *sub.split("/"))
        for d, _, fs in os.walk(base):
            for f in fs:
                if exts is None or f.endswith(exts):
                    out.append(os.path.join(d, f))
    out += [os.path.join(PANEL, "src", "lib", f) for f in LIB_FILES]
    out.append(os.path.join(PANEL, "components.json"))
    return sorted(set(out))


def digest(path):
    data = open(path, "rb").read().replace(b"\r\n", b"\n")
    return hashlib.sha256(data).hexdigest()


def current():
    res = {}
    for p in files():
        if not os.path.exists(p):
            sys.exit(f"ERRO: arquivo de design ausente: {os.path.relpath(p, ROOT)}")
        res[os.path.relpath(p, ROOT).replace(os.sep, "/")] = digest(p)
    return res


def read_lock():
    if not os.path.exists(LOCK):
        return None
    res = {}
    for line in open(LOCK, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#"):
            h, p = line.split("  ", 1)
            res[p] = h
    return res


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    cur = current()
    if "--update" in sys.argv:
        os.makedirs(os.path.dirname(LOCK), exist_ok=True)
        with open(LOCK, "w", encoding="utf-8", newline="\n") as f:
            f.write("# Assinatura do design de referência. Gerado por tools/check_design.py --update. NÃO edite à mão.\n")
            for p, h in cur.items():
                f.write(f"{h}  {p}\n")
        print(f"design.lock gravado: {len(cur)} arquivos")
        return 0
    lock = read_lock()
    if lock is None:
        sys.exit("ERRO: docs/design.lock não existe")
    changed = sorted(p for p in cur if p in lock and cur[p] != lock[p])
    added = sorted(p for p in cur if p not in lock)
    removed = sorted(p for p in lock if p not in cur)
    if not (changed or added or removed):
        print(f"DESIGN OK: {len(cur)} arquivos idênticos ao de referência")
        return 0
    print("DESIGN ALTERADO (a instalação deve ser uma cópia exata da de referência):")
    for p in changed:
        print("  mudou:   ", p)
    for p in added:
        print("  novo:    ", p)
    for p in removed:
        print("  faltando:", p)
    print("Desfaça a mudança. Se ela for intencional, ela pertence ao código de REFERÊNCIA (avise o dono do produto).")
    return 1


if __name__ == "__main__":
    sys.exit(main())
