# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# ffmpeg: converte o vídeo de fundo enviado em Personalização (corta em 8 s e comprime até 3 MB).
RUN apk add --no-cache ffmpeg
# Usuário sem privilégios, com UID/GID fixos (10001).
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Migrações do banco (lidas na inicialização por src/instrumentation.ts).
COPY --from=build --chown=app:app /app/drizzle ./drizzle
# Verificação do banco (rodada manualmente: node scripts/verify-db.mjs).
COPY --from=build --chown=app:app /app/scripts ./scripts
# Gravações de reunião: o volume persistente do Coolify é montado aqui (a pasta nasce do usuário app).
RUN mkdir -p /data/recordings && chown app:app /data/recordings
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/flow-api/health || exit 1
CMD ["node", "server.js"]
