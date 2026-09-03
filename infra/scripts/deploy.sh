#!/usr/bin/env bash
#
# Pull the latest code from GitHub and redeploy — run this ON THE VPS for every update.
#
#   cd /opt/exam-system && bash infra/scripts/deploy.sh
#
# It pulls main, rebuilds the images, and restarts the containers. Database migrations run
# automatically when the API container starts (its command is `prisma migrate deploy`), so
# schema changes are applied for you. Your data and secrets (infra/.env) are untouched.
set -euo pipefail

cd "$(dirname "$0")/../.."   # repo root (/opt/exam-system)

echo "▶ Pulling latest code from GitHub…"
git pull --ff-only

echo "▶ Rebuilding images and restarting containers…"
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env up -d --build

echo "▶ Waiting for the API to become healthy…"
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8080/api/v1/health >/dev/null 2>&1; then
    echo "✅ Deployed. https://e-exam.ru.ac.bd is live on the new version."
    exit 0
  fi
  sleep 3
done

echo "⚠ Health check didn't pass yet. Inspect the logs:"
echo "   docker compose -f infra/docker-compose.prod.yml logs -f api"
exit 1
