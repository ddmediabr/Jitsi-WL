# Design: cópia exata da referência

**Regra:** toda instalação sai visualmente idêntica à de referência. O cliente só troca a identidade da empresa. Este
documento diz o que é fixo, o que é do cliente, como conferir e o que fazer se algo precisar mudar.

## O que é fixo (vem do código, ninguém altera numa instalação)

| O quê | Onde |
|---|---|
| Tokens: cores, raios, sombras, curvas e tempos de animação, tipografia | `panel/src/app/globals.css` e `panel/src/app/layout.tsx` (fontes pelo `next/font`) |
| Telas e textos fixos do painel e do fluxo de entrada | `panel/src/app/**/*.tsx` |
| Componentes (shadcn, estilo `base-nova`, e os próprios) | `panel/src/components/**`, `panel/components.json` |
| Paletas, cores de destaque, temas, fundo da entrada, textos de saída, hall, marca, layout dos e-mails | `panel/src/lib/{accent,palette,theme,motion,entry-bg,entry-presets,entry-preset-list,exit-texts,hall,brand,mail-template}.ts*` |
| Vídeos e imagens de apoio (fundos de entrada, robô) e o favicon padrão | `panel/public/` e `panel/src/app/favicon.ico` |
| A interface do Jitsi dentro da sala (barra, menus, vídeo) | A imagem fixada `stable-11248-3` e as variáveis de `infra/jitsi/jitsi.env.template`. O painel a ajusta pela IFrame API (`panel/src/lib/jitsi.ts`) |

Princípios de movimento e desempenho (só CSS em `transform` e `opacity`, nada de `blur` sobre o vídeo, `prefers-reduced-motion`)
estão em [../panel/README.md](../panel/README.md). Eles fazem parte do design e não se negociam.

**Guarda automática:** `tools/check_design.py` compara a assinatura (SHA-256) desses arquivos com `docs/design.lock`. Qualquer
diferença faz o script falhar e listar o arquivo.

## O que é do cliente (vem do banco, em Personalização)

É o único lugar onde uma instalação pode ser diferente da outra:

| Campo | Padrão de uma instalação nova |
|---|---|
| Nome da marca | O valor de `BRAND_NAME` das variáveis do painel. Sem logo, o nome aparece em texto nas telas |
| Logo do tema escuro e do claro, favicon | Nenhum (o nome aparece em texto). **Os logos de uma empresa nunca vão para outra instalação** |
| Paleta e cor de destaque de cada tema, cor do texto dos botões | Paleta `azul`, sem cor manual |
| Tema padrão | `dark` |
| Fundo da entrada | Vídeo `faiscas` com os ajustes de cada tema (veja abaixo) |
| Textos do hall (título e subtítulo) | `Meeting Hall` e vazio |
| Textos das páginas de saída | Vazios: valem os textos de `exit-texts.ts` |
| Modelo do e-mail da gravação e cor dos e-mails | Vazios: valem os padrões de `mail-template.ts` |

O cliente pode mudar qualquer um deles pelo painel. A instalação, porém, **não muda nenhum por conta própria**: ela deixa os
padrões acima, que são os da referência.

### Fundo da entrada (garantido por migração)

O padrão do código é "sem fundo", mas a referência usa um vídeo. A migração `panel/drizzle/0025_design_reference.sql`
grava esse fundo em toda instalação nova, sem sobrescrever o que já existir:

```json
{"mode":"video","auto":true,"respectMotion":true,"videoPreset":"faiscas","imagePreset":"degrade",
 "dark":{"hue":180,"posX":30,"blend":"screen","invert":false,"opacity":100,"contrast":100,"saturate":100,"brightness":112},
 "light":{"hue":0,"posX":30,"blend":"multiply","invert":true,"opacity":100,"contrast":150,"saturate":100,"brightness":92}}
```

Foi testado: as 26 migrações num banco vazio produzem exatamente esse valor, igual ao da instalação de referência. Com
`"auto": true`, o ajuste dos filtros acompanha a paleta do cliente.

Para conferir uma instalação já no ar: `node scripts/export-settings.mjs` dentro do contêiner do painel imprime as
configurações e o tipo e tamanho das imagens da marca (sem o conteúdo). Veja `docs/OPERACAO.md`.

## Como conferir uma instalação

1. **Código (obrigatório, a LLM roda no fim):** `python tools/check_design.py` deve imprimir `DESIGN OK`. Se imprimir
   `DESIGN ALTERADO`, desfaça a mudança antes de seguir.
2. **Banco:** `node scripts/export-settings.mjs` não pode mostrar `entry_bg` diferente do acima, nem `palette` fora de
   `azul`, nem `default_theme` fora de `dark`, a menos que o cliente tenha pedido.
3. **Visual (humano):** abra, nos temas **escuro e claro**, e em **1440 px e 390 px** de largura:
   - o hall `https://<domínio>/` e uma sala (escolha cadastrado/convidado);
   - a tela de login do painel e "esqueci a senha";
   - Visão geral, Salas, Contas, Personalização, Gravações e Configurações do painel;
   - a sala em si (barra do Jitsi, menu de moderação, sala de espera).

   Compare com a instalação de referência (o dono do produto fornece o endereço ou as capturas). Só podem diferir:
   nome da marca, logos e favicon. Fonte, cores, espaçamento, ícones, animações e textos têm de ser iguais.
4. **E-mail:** o e-mail de teste (gravação ou redefinir senha) tem o mesmo layout da referência. Só muda o nome da marca.

## Se alguém quiser mudar o design

Uma instalação não pode. A mudança vai para o código de **referência**, e só o dono do produto a aprova:
1. altere `panel/` no repositório de referência e teste nos dois temas;
2. rode `python tools/check_design.py --update` e commite o `docs/design.lock` junto, no mesmo commit;
3. avise que **todas** as instalações existentes ficam diferentes da nova referência até serem atualizadas.

Se uma LLM de instalação perceber que algo parece "melhorável" no visual, ela **não** altera: ela avisa o humano.
