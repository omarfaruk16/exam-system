# Backup & Restore

The Examination System stores all durable state in **PostgreSQL** (users, exams, questions,
attempts, answers, results, audit log). Redis holds only sessions and transient queue/rate-limit
state and is **not** backed up — it rebuilds itself. Generated report files under `STORAGE_DIR`
are reproducible from the database and are likewise not part of the DB backup.

> **A university exam system that cannot restore its data is not production-ready.** Test your
> restore procedure on a staging copy regularly — a backup you have never restored is a guess.

## Scripts

| Script                     | Purpose                                                                     |
| -------------------------- | --------------------------------------------------------------------------- |
| `infra/scripts/backup.sh`  | `pg_dump` (custom format) → `./backups/exam_db_<ts>.dump`; keeps the last 7 |
| `infra/scripts/restore.sh` | Drops & recreates the DB, restores from a dump (confirmation required)      |

Both talk to the Postgres **container** (`exam_postgres`) via `docker exec`, so they need no local
`psql`/`pg_dump` install — only Docker. Override defaults with env vars:
`POSTGRES_CONTAINER`, `POSTGRES_DB`, `POSTGRES_USER`, `BACKUP_DIR`, `RETAIN`.

## Backing up

```bash
# One-off
infra/scripts/backup.sh

# Output:
# [..] backup: dumping database 'exam' from container 'exam_postgres'
# [..] backup: SUCCESS -> ./backups/exam_db_20260815_081508.dump (253131 bytes)
# [..] backup: retention OK (<= 7 backups on disk)
```

The dump is in `pg_dump --format=custom`, which is compressed and restorable with `pg_restore`
(selective restore, parallelism). The script keeps the **7 most recent** dumps and deletes older
ones.

### Scheduling (recommended)

Run daily during the maintenance window (see below), e.g. a 02:00 cron on the DB host:

```cron
0 2 * * *  /opt/exam-system/infra/scripts/backup.sh >> /var/log/exam-backup.log 2>&1
```

Ship the `./backups` directory off-box (object storage / another host) — a backup on the same disk
as the database is not a backup. Recommended cadence: **daily** dumps, retained 7 days locally,
plus a weekly copy retained off-site for 90 days.

## Restoring

> **Destructive.** `restore.sh` DROPS and recreates the database. Everything currently in it is
> lost and replaced by the dump. Never run it against a database with a live exam in progress.

```bash
# Interactive — prompts for confirmation (type the database name to proceed)
infra/scripts/restore.sh ./backups/exam_db_20260815_081508.dump

# Non-interactive (CI / automated DR test)
CONFIRM=exam infra/scripts/restore.sh ./backups/exam_db_20260815_081508.dump
```

After a restore, the API's Prisma pool reconnects automatically. Verify:

```bash
curl -s http://localhost:8080/api/v1/health/ready   # {"status":"ok","postgres":"ok","redis":"ok"}
```

## Verified restore test (2026-08-15)

The round-trip was tested end-to-end:

```
1. Seed a distinctive marker faculty:      INSERT 0 1
2. backup.sh:                              SUCCESS -> exam_db_20260815_081508.dump (253131 bytes)
3. Delete the marker from the live DB:     DELETE 1  (marker rows now = 0)
4. restore.sh (CONFIRM=exam):              SUCCESS -> 'exam' restored
5. Confirm the marker is present again:    1 row  ("ZZZ Backup Test Faculty 20260815", ZZBK)
```

The marker existed at dump time, was deleted from the live database, and reappeared after the
restore — proving the dump captures data and the restore faithfully reinstates it.

## Disaster-recovery checklist

1. Provision a fresh Postgres 17 container/host with the same credentials.
2. `docker compose up -d postgres` (and `redis`).
3. `CONFIRM=exam infra/scripts/restore.sh <latest off-site dump>`.
4. Start the API/web; hit `/api/v1/health/ready`.
5. Spot-check: an admin logs in, the exam list and audit log are intact.
