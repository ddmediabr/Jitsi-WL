#!/bin/sh
# Script de finalizacao do Jibri (JIBRI_FINALIZE_RECORDING_SCRIPT_PATH): entrega a gravacao ao painel e libera o espaco.
# $1 = pasta da gravacao (/recordings/<sessao>), com <sala>_<data>.mp4 e metadata.json.
# Variaveis (do servico do Jibri): DDMEDIA_INGEST_SECRET e DDMEDIA_INGEST_URL (https://<dominio>/flow-api/recordings/ingest), ambas obrigatorias.
DIR="$1"
URL="${DDMEDIA_INGEST_URL}"
[ -d "$DIR" ] || exit 0
if [ -z "$URL" ] || [ -z "$DDMEDIA_INGEST_SECRET" ]; then
  echo "[ddmedia-finalize] DDMEDIA_INGEST_URL/DDMEDIA_INGEST_SECRET ausentes; gravacao mantida em $DIR" >&2
  echo "sem configuracao de entrega" > "$DIR/ENTREGA_FALHOU"
  exit 0
fi
SESSION=$(basename "$DIR")
for f in "$DIR"/*.mp4; do
  [ -f "$f" ] || continue
  NAME=$(basename "$f")
  ROOM="${NAME%_*}"
  DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f" 2>/dev/null | cut -d. -f1)
  STARTED=$(date -u -d "@$(( $(date +%s) - ${DUR:-0} ))" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)
  RES=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$f" 2>/dev/null | head -n1)
  if curl -fsS --retry 4 --retry-delay 10 --retry-all-errors --max-time 7200 -X POST --upload-file "$f" \
    -H "Authorization: Bearer ${DDMEDIA_INGEST_SECRET}" -H "Content-Type: video/mp4" \
    -H "X-Rec-Room: $ROOM" -H "X-Rec-Session: $SESSION" -H "X-Rec-Name: $NAME" \
    -H "X-Rec-Resolution: ${RES}" -H "X-Rec-Duration: ${DUR:-0}" -H "X-Rec-Started: ${STARTED}" "$URL" >/dev/null; then
    echo "[ddmedia-finalize] entregue $NAME (sala $ROOM)"
    rm -rf "$DIR"
  else
    echo "[ddmedia-finalize] FALHA ao entregar $NAME; mantido em $DIR" >&2
    echo "falha em $(date -u +%FT%TZ)" > "$DIR/ENTREGA_FALHOU"
  fi
done
exit 0
