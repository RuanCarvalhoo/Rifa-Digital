# syntax=docker/dockerfile:1
# =============================================================================
#  Rifinha Digital — Dockerfile (multi-stage)
# -----------------------------------------------------------------------------
#  Estratégia multi-stage: separa a instalação de dependências da imagem final.
#  Vantagens: imagem final menor, cache de camadas eficiente e superfície de
#  ataque reduzida (sem toolchain de build nem devDependencies em produção).
# =============================================================================

# ---- Base ------------------------------------------------------------------
# node:20-alpine: Node LTS sobre Alpine (imagem pequena, ~50MB base).
# Fixamos a MAJOR (20) por estabilidade; em produção recomenda-se fixar por
# digest (node:20-alpine@sha256:...) para builds 100% reprodutíveis.
# Alternativa: imagem "-slim" (Debian) — maior, porém com glibc (mais compatível
# com dependências nativas). Alpine (musl) foi escolhida pelo tamanho; o driver
# `pg` é JS puro e não sofre com musl.
FROM node:20-alpine AS base
WORKDIR /app
# dumb-init: init leve para PID 1 — encaminha sinais (SIGTERM) e evita processos
# zumbis, garantindo shutdown gracioso (o server.js trata SIGTERM/SIGINT).
RUN apk add --no-cache dumb-init

# ---- Dependencies ----------------------------------------------------------
# Estágio dedicado a instalar SOMENTE dependências de produção.
# Copiamos apenas os manifests primeiro: enquanto package*.json não mudarem,
# o Docker reaproveita o cache desta camada (não reinstala a cada alteração
# de código-fonte).
FROM base AS deps
COPY package.json package-lock.json* ./
# `npm ci` = install determinístico a partir do lockfile (ideal para CI/CD).
# `--omit=dev` remove devDependencies (jest, supertest) da imagem final.
RUN npm ci --omit=dev

# ---- Runtime (produção) ----------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
# node_modules já resolvido vem do estágio `deps` (sem toolchain de build).
COPY --from=deps /app/node_modules ./node_modules
# Código-fonte da aplicação.
COPY package.json ./
COPY src ./src

# Segurança: rodar como usuário não-root. A imagem node:alpine já traz o
# usuário `node` (uid 1000); ajustamos a posse do diretório da app.
RUN chown -R node:node /app
USER node

EXPOSE 3000

# Healthcheck no nível da imagem: consulta o endpoint /api/health.
# O orquestrador/compose usa isso para saber quando o container está pronto.
# wget faz parte do BusyBox (Alpine), sem instalar nada extra.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# dumb-init como PID 1 -> repassa sinais corretamente ao Node.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/server.js"]
