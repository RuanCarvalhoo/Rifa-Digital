# syntax=docker/dockerfile:1
# =============================================================================
#  Rifinha Digital — Frontend (React + Vite) — Dockerfile multi-stage
# -----------------------------------------------------------------------------
#  Estágio 1 (build): instala dependências e gera os estáticos com o Vite.
#  Estágio 2 (runtime): serve os estáticos com Nginx (imagem enxuta) e faz
#  proxy de /api para o serviço da API, na mesma rede do Compose.
# =============================================================================

# ---- Build -----------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
# Copiamos apenas os manifests primeiro para aproveitar o cache de camadas:
# enquanto package*.json não mudarem, o npm ci não roda de novo.
COPY package.json package-lock.json* ./
# npm ci = install determinístico a partir do lockfile. Aqui precisamos das
# devDependencies (vite, @vitejs/plugin-react) para o build, então NÃO usamos
# --omit=dev.
RUN npm ci
# Código-fonte e geração do bundle de produção (saída em /app/dist).
COPY . .
RUN npm run build

# ---- Runtime (Nginx) -------------------------------------------------------
FROM nginx:1.27-alpine AS runtime
# Configuração do Nginx: SPA fallback + proxy reverso para a API.
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Estáticos gerados no estágio de build.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# Healthcheck simples: o Nginx respondendo já indica que o container está de pé.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

# A imagem oficial do Nginx já define o CMD/entrypoint corretos.
