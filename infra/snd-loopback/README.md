# infra/snd-loopback — placa de som virtual do gravador

O Jibri grava o áudio por uma placa de som virtual: o módulo de kernel `snd-aloop`. O contêiner do Jibri não carrega
módulos, e o agente de instalação não tem SSH. Por isso existe o app **snd-loopback-loader**: um contêiner mínimo
que traz os arquivos do módulo para o kernel do servidor, carrega o `snd-aloop` e fica parado (`sleep infinity`).

Sem o módulo carregado, o Jibri não sobe e a gravação fica parada. Ao subir, o log do loader mostra `snd-aloop CARREGADO`
ou `snd-aloop ja estava carregado`.

## Criar no Coolify

- **Tipo:** aplicação com build pack **Dockerfile** (conteúdo colado, sem repositório Git), no mesmo servidor do Jibri.
- **Opções de execução** (`custom_docker_run_options`): `--cap-drop=ALL --cap-add=SYS_MODULE --security-opt=no-new-privileges:true`.
  Nunca use `--privileged`.
- **Rede:** sem domínio, sem porta e sem health check.
- **Ordem:** deve estar rodando antes de subir o serviço do gravador.

## O `Dockerfile` deste diretório é um EXEMPLO

O arquivo vale para **Oracle Cloud ARM (aarch64), Ubuntu 22.04, kernels `6.8.0-1062-oracle` e `6.8.0-1067-oracle`**.
Os módulos precisam ser do MESMO kernel que roda no servidor (versão e compilação), então cada servidor exige as linhas
`dl` dele.

1. **Descobrir o kernel e a arquitetura.** Use `get_server` no Coolify:
   - `server_metadata.kernel` é o kernel em execução;
   - `server_metadata.arch` é a arquitetura;
   - em `patch_check_result.kernels`, olhe `running`, `boot` e `installed`.

   Inclua no Dockerfile **o kernel em execução E o de boot**, se forem diferentes. Isso cobre a próxima reinicialização:
   uma atualização de kernel com reinício já derrubou a gravação uma vez.
2. **Achar os pacotes.** Para kernel Ubuntu `X.Y.Z-NNNN-<sabor>`, os pacotes são
   `linux-modules-X.Y.Z-NNNN-<sabor>` e `linux-modules-extra-X.Y.Z-NNNN-<sabor>`.
   - Em arm64, ficam em `https://ports.ubuntu.com/ubuntu-ports/pool/main/l/<pacote-fonte>/`.
   - Em amd64, ficam em `https://archive.ubuntu.com/ubuntu/pool/main/l/<pacote-fonte>/`.
   - O `<pacote-fonte>` é, por exemplo, `linux-oracle-6.8`, `linux-aws`, `linux-azure` ou `linux-hwe-6.8`.

   O nome exato do arquivo e o **SHA256** saem do índice oficial por HTTPS:
   `dists/<versão>-updates/main/binary-<arch>/Packages.gz` (ou `-security`), campos `Filename` e `SHA256`.
3. **Editar o Dockerfile:**
   - `POOL` deve apontar para a pasta do pacote-fonte;
   - escreva uma linha `dl <arquivo.deb> <sha256>` por pacote.

   O build confere o SHA256 e falha se não bater. Nunca desligue essa conferência.
4. Em servidor **amd64**, troque o nome do arquivo (`_arm64.deb` vira `_amd64.deb`) e o `POOL`. O resto do arquivo não muda.
5. **Kernel que não é do Ubuntu** (Debian ou outra distribuição): os pacotes e o índice são outros, mas a lógica é a mesma.
   Se o próprio servidor já tem `/lib/modules/$(uname -r)/kernel/sound/drivers/snd-aloop.ko*`, uma alternativa mais
   simples exige um humano com SSH: `modprobe snd-aloop` no servidor, e incluir `snd-aloop` em `/etc/modules`.

## Quando o kernel do servidor mudar

O log do loader mostra `ATENCAO: kernel ... sem modulos nesta imagem`. Para corrigir:
1. Acrescente as linhas `dl` do kernel novo, mantendo as antigas.
2. Faça o redeploy do loader.
3. **Reinicie o serviço do gravador inteiro**. Não reinicie só o contêiner `jibri`, porque o `webproxy` ficaria preso
   ao namespace de rede antigo.
