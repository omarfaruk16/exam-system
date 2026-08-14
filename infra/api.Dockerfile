# API image (NestJS + embedded workers). Build context is the repo root.
FROM node:24-bookworm-slim

RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the whole workspace (host node_modules excluded via .dockerignore) and install fresh.
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @exam/types build \
  && pnpm --filter @exam/api exec prisma generate \
  && pnpm --filter @exam/api build

WORKDIR /app/apps/api
EXPOSE 4100

# Apply migrations, then start the API (RUN_EMBEDDED_WORKERS defaults on → grading/import/etc. run here).
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
