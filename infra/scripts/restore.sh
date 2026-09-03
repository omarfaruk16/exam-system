#!/usr/bin/env bash
#
# Restore the Examination System database from a pg_dump custom-format file.
# THIS DROPS AND RECREATES THE DATABASE — all current data is lost.
#
# Usage:  infra/scripts/restore.sh <path-to-dump>
# Non-interactive (CI/tests):  CONFIRM=<dbname> infra/scripts/restore.sh <dump>
#
set -euo pipefail

FILE="${1:-}"
CONTAINER="${POSTGRES_CONTAINER:-exam_postgres}"
DB="${POSTGRES_DB:-exam}"
DB_USER="${POSTGRES_USER:-exam}"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

if [ -z "$FILE" ]; then
  echo "Usage: infra/scripts/restore.sh <path-to-dump>"
  exit 2
fi
if [ ! -f "$FILE" ]; then
  echo "[$(ts)] restore: no such dump file: $FILE"
  exit 1
fi

echo "============================================================"
echo " WARNING: This will DROP and RECREATE the database '$DB'."
echo "          Every row currently in '$DB' will be permanently"
echo "          lost and replaced with the contents of:"
echo "            $FILE"
echo "============================================================"

# Confirmation: read from \$CONFIRM if set (non-interactive), else prompt.
if [ -n "${CONFIRM:-}" ]; then
  REPLY="$CONFIRM"
else
  read -r -p "Type the database name ('$DB') to proceed: " REPLY
fi
if [ "$REPLY" != "$DB" ]; then
  echo "[$(ts)] restore: aborted (confirmation did not match '$DB')"
  exit 1
fi

echo "[$(ts)] restore: terminating active connections to '$DB'"
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB' AND pid <> pg_backend_pid();" >/dev/null

echo "[$(ts)] restore: dropping and recreating '$DB'"
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DB\";" >/dev/null
docker exec -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB\";" >/dev/null

echo "[$(ts)] restore: restoring from $FILE"
if docker exec -i -e PGPASSWORD="${POSTGRES_PASSWORD:-}" "$CONTAINER" pg_restore -U "$DB_USER" -d "$DB" --no-owner --no-privileges <"$FILE"; then
  echo "[$(ts)] restore: SUCCESS -> '$DB' restored from $FILE"
else
  echo "[$(ts)] restore: pg_restore reported warnings/errors (review output above)"
  exit 1
fi
