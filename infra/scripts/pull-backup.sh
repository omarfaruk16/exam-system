#!/usr/bin/env bash
#
# Download the LATEST database backup from the VPS to your own machine.
# Run this LOCALLY (on your laptop), not on the server:
#
#   infra/scripts/pull-backup.sh [dest-dir]
#
# Uses SSH keys (set those up first — see infra/DEPLOYMENT.md § 1). Override the target with env:
#   SSH_HOST=root@103.99.176.199 SSH_PORT=36179 infra/scripts/pull-backup.sh ~/exam-backups
set -euo pipefail

SSH_HOST="${SSH_HOST:-root@e-exam.ru.ac.bd}"
SSH_PORT="${SSH_PORT:-36179}"
REMOTE_DIR="${REMOTE_DIR:-/opt/exam-system/backups}"
DEST="${1:-./backups}"

mkdir -p "$DEST"
echo "Finding newest backup on $SSH_HOST …"
LATEST=$(ssh -p "$SSH_PORT" "$SSH_HOST" "ls -1t $REMOTE_DIR/exam_db_*.dump 2>/dev/null | head -1" || true)
[ -n "$LATEST" ] || { echo "No backups found in $SSH_HOST:$REMOTE_DIR"; exit 1; }

echo "Downloading $LATEST → $DEST/"
scp -P "$SSH_PORT" "$SSH_HOST:$LATEST" "$DEST/"
echo "Done. Restore into a running stack with:"
echo "  scp back to the server, then: POSTGRES_DB=exam_prod infra/scripts/restore.sh <dump>"
