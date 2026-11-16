# Transcrição e análise das gravações (Gemini)

Opcional: sem `GEMINI_API_KEY` no painel, o recurso fica desligado e só a gravação existe. A chave deve ser de um
projeto do Google AI Studio **com faturamento**. No plano gratuito, o conteúdo pode ser usado para treino e as cotas
não aguentam reuniões longas.

## Como funciona

- **Pipeline:** roda inteiro no painel (`panel/src/server/transcription/`).
  1. O `ffmpeg` extrai o áudio (MP3 16 kHz, mono).
  2. O áudio vai para a Files API do Gemini.
  3. **Duas etapas, cada uma com a sua cascata:** a transcrição (áudio para falas com tempo e falante) e a análise
     (texto para resumo executivo, participantes, tópicos, decisões, pendências, insights, tarefas por falante e pontos
     de atenção).
- **Saídas:** `.txt` diagramado e `.docx` (capa e 8 seções), baixados em
  `/settings/gravacoes/<id>/transcricao?tipo=txt|docx`.
- **Cascata "Automático"** (padrão): `gemini-3.8-flash`, depois `gemini-3.6-flash`, depois `gemini-3.5-flash-lite`
  (`panel/src/lib/transcription.ts`).
  - Erro passageiro (5xx, rede, JSON ruim): 2 tentativas por modelo.
  - Cota ou pedido recusado (429, 400, 403, 404): 1 tentativa e passa ao próximo.
  - Chave inválida: aborta.
- **Modelo único** (só o proprietário escolhe): 3 tentativas seguidas no modelo.
- **Rodadas:** se uma rodada inteira falha, a execução fica `waiting` e roda de novo 1 h depois, até 3 rodadas. Depois
  disso é erro definitivo, e a transcrição é pedida de novo à mão. O trabalhador confere a fila a cada 2 min.
  - Erro da própria gravação (sem áudio, curta demais, arquivo ausente) é definitivo na hora.
- **Glossário:** termos, siglas e nomes que a IA deve respeitar, em Configurações > Sala (Live) > "Transcrição e resumo
  (IA)".

## Quando transcreve

- **"Transcrever ao final"** (menu da sala, ao lado de Gravar):
  - liga sozinho quando a gravação começa;
  - o moderador real desliga ou liga a qualquer momento;
  - vale o estado **no instante em que a gravação termina**.
- **Sem o botão ligado:** só a gravação. A transcrição é pedida à mão em Gravações > Abrir.

## E-mails (Resend)

- O e-mail vai ao **iniciador** da gravação, se a conta dele tiver e-mail cadastrado.
- **Sem "Transcrever ao final":** sai na hora, com o link de download assinado (24 h).
- **Com "Transcrever ao final":** sai depois da transcrição, com o `.txt` e o `.docx` anexos. Se a transcrição falhar em
  definitivo, sai só com a gravação e avisa.
- **Envio manual:** Gravações > Abrir > Pronto > "Enviar por e-mail" manda um `.zip` com os dois arquivos ao endereço
  digitado.
- **Layout:** é único para todos os e-mails do sistema (gravação, redefinir senha, código 2FA), em
  `panel/src/lib/mail-template.ts`. O texto do e-mail da gravação e a cor de todos são editáveis em
  Personalização > E-mails.

## Custos e limites

- Uma reunião de 1 h usa duas chamadas (transcrição e análise). O custo depende da tabela do Gemini no dia: confira em
  AI Studio > Usage.
- O Node corta `fetch` longo em 5 min. O pipeline usa o `fetch` do `undici` com o próprio Agent. Não misture com o
  `fetch` embutido.
