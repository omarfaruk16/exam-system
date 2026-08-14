# API image (NestJS + embedded workers). Build context is the repo root.
FROM node:24-bookworm-slim

RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. Manifests first — this dependency layer is cached unless a package.json / lockfile changes,
#    so source-only rebuilds skip the (slow) install step.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/types/package.json ./packages/types/
COPY packages/config/package.json ./packages/config/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
# Persistent pnpm store (BuildKit cache) so retries/rebuilds reuse already-fetched packages
# instead of re-downloading over the slow registry link.
ENV npm_config_store_dir=/pnpm-store
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store pnpm install --frozen-lockfile

# 2. Source, then build.
COPY . .
RUN pnpm --filter @exam/types build \
  && pnpm --filter @exam/api exec prisma generate \
  && pnpm --filter @exam/api build

WORKDIR /app/apps/api
EXPOSE 4100

# Apply migrations, then start the API (RUN_EMBEDDED_WORKERS defaults on → workers run here).
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
