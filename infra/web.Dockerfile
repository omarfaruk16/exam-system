# Web image: build the Vite SPA, serve it with nginx (which also proxies /api to the API container).
FROM node:24-bookworm-slim AS build
RUN corepack enable
WORKDIR /app

# Manifests first for a cached dependency layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
# Persistent pnpm store (BuildKit cache) — see api.Dockerfile.
ENV npm_config_store_dir=/pnpm-store
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store pnpm install --frozen-lockfile

COPY . .
ARG VITE_INSTITUTION_NAME="University of Rajshahi"
RUN pnpm --filter @exam/types build \
  && VITE_INSTITUTION_NAME="${VITE_INSTITUTION_NAME}" pnpm --filter @exam/web build

FROM nginx:1.27-alpine
COPY infra/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
