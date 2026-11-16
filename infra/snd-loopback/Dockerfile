# Carregador do módulo de áudio virtual snd-aloop (o Jibri precisa dele para gravar).
# EXEMPLO para Oracle ARM / Ubuntu 22.04 (veja README.md para adaptar ao kernel de outro servidor).
# App do Coolify "snd-loopback-loader", build pack Dockerfile, opções de execução:
#   --cap-drop=ALL --cap-add=SYS_MODULE --security-opt=no-new-privileges:true   (sem --privileged, sem porta/domínio)
# Traz os módulos de MAIS DE UM kernel do servidor (Oracle ARM, Ubuntu 22.04, linux-oracle-6.8) e escolhe pelo `uname -r`,
# para que uma atualização de kernel com reinício não derrube a gravação. Kernel novo no servidor = acrescentar uma linha
# `dl` com o pacote e o SHA256 do índice HTTPS oficial (jammy-security/main, binary-arm64) e redeployar.
FROM ubuntu:22.04
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl kmod zstd \
 && rm -rf /var/lib/apt/lists/*
ARG POOL=https://ports.ubuntu.com/ubuntu-ports/pool/main/l/linux-oracle-6.8
RUN set -eu; mkdir -p /m /tmp/d; cd /tmp/d; \
  dl() { curl -fsSL -o pkg.deb "$POOL/$1"; echo "$2  pkg.deb" | sha256sum -c -; dpkg-deb -x pkg.deb /tmp/d/x; rm -f pkg.deb; }; \
  dl linux-modules-6.8.0-1062-oracle_6.8.0-1062.65~22.04.1_arm64.deb 69083d15ae309acc5fbd4743d8b1212af4bb037e8a1a403e6b2697e002f4e59a; \
  dl linux-modules-extra-6.8.0-1062-oracle_6.8.0-1062.65~22.04.1_arm64.deb 1d67e3823146230eb48225ddbdb2c8db77b160dc04c33c982a41573e699474c4; \
  dl linux-modules-6.8.0-1067-oracle_6.8.0-1067.71~22.04.1_arm64.deb 5635b088bbf0f35f019374536ec7da9b99e56886d9554276a7098f8688c58181; \
  dl linux-modules-extra-6.8.0-1067-oracle_6.8.0-1067.71~22.04.1_arm64.deb c39de770a7137514959ac8236cf2aac136abd933cc7e64f6cb322cd66c94e38d; \
  for k in /tmp/d/x/lib/modules/*; do \
    v=$(basename "$k"); mkdir -p "/m/lib/modules/$v/kernel"; \
    cp -a "$k/kernel/sound" "/m/lib/modules/$v/kernel/"; \
    cp "$k"/modules.order "$k"/modules.builtin "$k"/modules.builtin.modinfo "/m/lib/modules/$v/" 2>/dev/null || true; \
    find "/m/lib/modules/$v" -name '*.ko.zst' -exec zstd -q -d --rm {} \; ; \
    depmod -b /m "$v"; \
    test -n "$(find /m/lib/modules/$v -name 'snd-aloop.ko')"; \
  done; \
  rm -rf /tmp/d
COPY <<'EOF' /usr/local/bin/load-aloop
#!/bin/sh
K=$(uname -r)
echo "kernel em execucao: $K (modulos nesta imagem: $(ls /m/lib/modules | tr '\n' ' '))"
grep -E '^(CapEff|NoNewPrivs)' /proc/self/status
if grep -q '^snd_aloop ' /proc/modules; then
  echo "snd-aloop ja estava carregado"
elif [ -d "/m/lib/modules/$K" ]; then
  modprobe -d /m snd-aloop index=0 id=Loopback && echo "snd-aloop CARREGADO"
else
  echo "ATENCAO: kernel $K sem modulos nesta imagem; acrescentar o pacote no Dockerfile e redeployar"
fi
grep '^snd_aloop ' /proc/modules || echo "snd-aloop NAO carregado"
exec sleep infinity
EOF
RUN chmod 755 /usr/local/bin/load-aloop
CMD ["/usr/local/bin/load-aloop"]
