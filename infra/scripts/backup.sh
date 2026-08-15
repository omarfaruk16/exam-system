#!/usr/bin/env bash
#
# Postgres backup for the Examination System.
#   - Dumps the DB in pg_dump custom format to $BACKUP_DIR/exam_db_YYYYMMDD_HHMMSS.dump
#   - Retains the last 7 daily backups (older ones are removed)
#   - Logs success/failure to stdout (pipe to a log file or run from cron)
#
# Usage:  infra/scripts/backup.sh
# Cron :  0 2 * * *  /path/to/infra/scripts/backup.sh >> /var/log/exam-backup.log 2>&1
#
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
CONTAINER="${POSTGRES_CONTAINER:-exam_postgres}"
DB="${POSTGRES_DB:-exam}"
DB_USER="${POSTGRES_USER:-exam}"
RETAIN="${RETAIN:-7}"

ts() { date '+%Y-%m-%d %H:%M:%S'; }

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/exam_db_${STAMP}.dump"

echo "[$(ts)] backup: dumping database '$DB' from container '$CONTAINER'"

if docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB" --format=custom >"$FILE"; then
  SIZE=$(wc -c <"$FILE" | tr -d ' ')
  if [ "$SIZE" -gt 0 ]; then
    echo "[$(ts)] backup: SUCCESS -> $FILE (${SIZE} bytes)"
  else
    echo "[$(ts)] backup: FAILED -> dump file is empty"
    rm -f "$FILE"
    exit 1
  fi
else
  echo "[$(ts)] backup: FAILED -> pg_dump returned an error"
  rm -f "$FILE"
  exit 1
fi

# Retention: keep the newest $RETAIN dumps, delete the rest.
REMOVED=$(ls -1t "$BACKUP_DIR"/exam_db_*.dump 2>/dev/null | tail -n +$((RETAIN + 1)) || true)
if [ -n "$REMOVED" ]; then
  echo "$REMOVED" | xargs rm -f
  echo "[$(ts)] backup: pruned $(echo "$REMOVED" | wc -l | tr -d ' ') old backup(s), retaining last $RETAIN"
else
  echo "[$(ts)] backup: retention OK (<= $RETAIN backups on disk)"
fi
