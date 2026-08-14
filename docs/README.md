# University Examination System — Documentation

Secure online examinations for **University of Rajshahi**. Teachers author exams, admins review
and approve, students take timed exams, MCQs auto-grade, written answers route to teachers, and
mark sheets/reports are generated.

**Design priorities (in order): integrity → reliability → security → performance → clean modern UI.**

---

## 1. Architecture

pnpm monorepo:

| Path              | What                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| `apps/api`        | NestJS 11 API (REST + BullMQ workers), Prisma, argon2, Redis sessions                |
| `apps/web`        | React 18 + Vite SPA (TanStack Query/Router-lite, Tailwind v4, Radix/shadcn-style UI) |
| `packages/types`  | Shared TypeScript types + Zod schemas (`@exam/types`), built with tsup               |
| `packages/config` | Shared tsconfig presets (`@exam/config`)                                             |
| `infra`           | `docker-compose.yml` (Postgres, Redis, PgBouncer), Prisma migrations                 |
| `docs`            | This document                                                                        |

The server is authoritative for time, correct answers, grading, and authorization. The SPA displays;
the server decides. Every sensitive action is authorized server-side and written to an append-only
audit log.

## 2. Prerequisites

- Node ≥ 20 (tested on 24), Docker + Docker Compose, pnpm 11 (via `corepack`).
- If pnpm is missing: `corepack enable --install-directory ~/.local/bin pnpm`.

## 3. Ports (non-standard — this machine already runs other services)

| Service    | Port     | Note                                                       |
| ---------- | -------- | ---------------------------------------------------------- |
| Web (Vite) | **5173** | proxies `/api` → API                                       |
| API        | **4100** | `4000`/`4010` were taken                                   |
| Postgres   | **5436** | `5432`–`5435`, `5544`, `5847` were taken by other projects |
| Redis      | **6379** |                                                            |

Change them in `infra/docker-compose.yml`, `apps/api/.env`, and `apps/web/vite.config.ts` if needed.

## 4. Setup & run

```bash
pnpm install                       # install workspace
pnpm infra:up                      # start Postgres (5436) + Redis (6379)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm --filter @exam/types build    # build shared types once
pnpm db:migrate                    # apply migrations
pnpm db:seed                       # seed demo data

# then, in the repo root:
pnpm dev                           # types (watch) + API (4100) + web (5173)
```

Open **http://localhost:5173**. To run pieces individually:
`pnpm --filter @exam/api dev` and `pnpm --filter @exam/web dev`.

### Demo logins (change in production)

| Role                  | Login                           | Password      |
| --------------------- | ------------------------------- | ------------- |
| Super Admin           | `superadmin`                    | `Admin@12345` |
| Admin                 | `admin`                         | `Admin@12345` |
| Department Head (CSE) | `cse.head`                      | `Admin@12345` |
| Teacher               | `teacher1`, `teacher2`          | `Admin@12345` |
| Student               | `2021001`, `2021002`, `2021003` | `Student@123` |

## 5. Environment variables

See `apps/api/.env.example` and `apps/web/.env.example` for the full annotated list. Highlights:

- **API**: `DATABASE_URL` (runtime), `DIRECT_URL` (Prisma Migrate — never through PgBouncer),
  `REDIS_URL`, `SESSION_SECRET` (≥16 chars), `COOKIE_SECURE` (true behind HTTPS), `CORS_ORIGINS`,
  `INSTITUTION_NAME`, `BRAND_PRIMARY`. Validated at boot (Zod) — the process refuses to start on a
  missing/invalid variable.
- **Web**: talks to a relative `/api` path (Vite proxy in dev, nginx in prod), so no API URL is
  needed. `VITE_API_PROXY_TARGET` overrides the dev proxy target.

## 6. Database

- Prisma + PostgreSQL. Internal `Int` ids for joins; `publicId` (uuid) for anything in a URL.
  `createdAt`/`updatedAt` everywhere; `deletedAt` for soft deletes (no academic data is ever
  hard-deleted). CHECK constraints (marks ≥ 0, semester 1–8, term dates) live in the migration SQL.
- **PgBouncer**: in dev the API connects **directly** to Postgres (simple, reliable). In production,
  point `DATABASE_URL` at PgBouncer (`:6432`, transaction pooling, add `?pgbouncer=true`) and keep
  `DIRECT_URL` on `:5432` for migrations. Start it with `docker compose --profile pgbouncer up -d`.
- **High-growth tables** (`ExamAttempt`, `Answer`, `AuditLog`) are structured so monthly range
  partitioning on `createdAt` can be added later without a rewrite.
- **Backups (planned, phase 6)**: WAL archiving + base backups for point-in-time recovery, with a
  tested restore procedure documented here.

## 7. Authentication & authorization

- Passwords hashed with **argon2id** (OWASP params m=19MiB, t=2, p=1).
- **Sessions**: `express-session` + `connect-redis` (httpOnly, SameSite=Lax, Secure in prod),
  wired through Passport's local strategy. Sessions live in Redis and are **revocable**; only the
  user id is stored in the session and the full principal is reloaded per request, so role/status
  changes (and suspensions) take effect immediately. Students are limited to a **single active
  session**.
- **Scoped RBAC**: a global `AuthenticatedGuard` + `RolesGuard` gate every route; `AccessControlService`
  enforces faculty/department scope at the service layer (`super_admin` unscoped, `admin` optional
  faculty scope, `department_head` department scope). The SPA hides UI it shouldn't show, but the
  server is the real gate.
- Login is rate-limited (10/min per IP). Progressive lockout/backoff and a Redis-backed throttler
  store (for multi-instance) come in phase 6, alongside TOTP 2FA (schema fields already present).

## 8. Testing

```bash
pnpm -r typecheck        # strict TS across the workspace
pnpm --filter @exam/api test   # vitest unit tests
```

Unit + integration tests cover student-import validation, scoped RBAC, argon2, the exam state
machine + snapshot, and the full exam-taking path (idempotent/concurrent submit, deadline 409,
session supersession, auto-submit, snapshot-based MCQ scoring, results gating).

**k6 load test** (`tests/load/exam-submit.js`): 300 students each start, autosave 5 answers, and
submit within a 60s window.

```bash
# API must be running; disable per-IP throttle for the single-source run (all traffic = one IP):
pnpm --filter @exam/api exec tsx scripts/load-setup.ts 300      # prints EXAM_ID
docker run --rm -i --add-host=host.docker.internal:host-gateway grafana/k6 run \
  -e BASE=http://host.docker.internal:4100/api/v1 -e EXAM_ID=<id> -e VUS=300 - < tests/load/exam-submit.js
```

Measured result: **submit p95 ≈ 336 ms** (target < 2 s), **zero 5xx**, and **zero duplicate
`(examId, studentId)` rows** — the unique constraint plus the Redis lock hold under 300 concurrent
submitters, all auto-graded.

## 9. Key decisions & deviations

- **Auth stack**: `express-session` + `connect-redis` + Passport local (revocable Redis sessions),
  chosen over a bespoke cookie scheme — matches the brief and is well-trodden.
- **PDF export** will use **pdfkit** (no headless Chromium) rather than puppeteer — lighter on a VPS
  and sufficient for tabular mark sheets. (Decided now; implemented phase 5.)
- **Workers** run **embedded** in the API by default (one `pnpm dev`). A separate entrypoint
  (`src/worker.ts` + `WorkerModule`) already exists: set `RUN_EMBEDDED_WORKERS=false` on the API and
  run `node dist/worker.js` to move them to their own process/container — no code change needed.
- **Soft delete** is enforced by a Prisma client extension (`PrismaService.db`), not per-query filters:
  reads exclude `deletedAt` rows and deletes set `deletedAt`. Note: nested `include` reads are not
  auto-filtered — add an explicit `where: { deletedAt: null }` there when it matters.
- **Scope** is enforced at the service layer via `AccessControlService` (super_admin unscoped,
  admin optional faculty scope, department_head department scope) — proven by integration tests.
- **Exam snapshot**: on `approved → published` each question's text/options/correct-answer/marks is
  copied into its `ExamQuestion` (snapshot* columns). The exam serves the snapshot from then on, so
  later bank edits can never alter a published exam. Questions in published+ exams are edit-locked.
- **Exam state machine** (`exam-state.ts`) is enforced server-side; invalid transitions are rejected.
  `published → live → ended` fire automatically by `startAt`/`endAt` via a BullMQ repeatable sweep
  (`ExamSchedulerService`), which is restart-safe and race-guarded. Creating/publishing an exam
  re-checks that the OfferingPart and its CourseOffering are not soft-deleted (closes the cascade gap).
- **Exam-taking**: the deadline is `min(exam.endAt, startedAt + durationMinutes)`, computed once on
  the server and stored in Redis — never from the client. The paper is cached per exam (Redis) with
  correct answers stripped; shuffle is seeded from the attempt id so a reconnect is stable. Autosave
  UPSERTs on `(attemptId, questionId)`. Submit is idempotent: an idempotency key returns the cached
  result and a Redis lock serializes concurrent submits; auto-submit uses the SAME finalize path.
  MCQ scoring compares the answer to `ExamQuestion.snapshotCorrectOptionId` (frozen at publish), so
  bank edits can't change a graded score.
- **Rate limiting** is per-IP. The k6 run sets `DISABLE_THROTTLE=true` only because all 300 VUs share
  one source IP; in production throttling stays on. For multiple API instances, move the throttler
  store to Redis (phase 6).
- **Grading & reporting**: written scores are validated against `ExamQuestion.snapshotMarks` (0..max).
  A shared finalizer writes `ExamResult` (finalScore, percentage, and a per-question `breakdown` JSON)
  once every answer is graded, then a results job re-ranks the whole exam with a Postgres
  `DENSE_RANK()` window function and auto-advances the exam to `results_published`. The **overall**
  mark sheet reads only `ExamResult` (+ the enrolled roster) — never scanning `Answer`; the per-question
  breakdown lives in `ExamResult.breakdown`. The **individual** sheet reads one attempt's rows (a
  targeted read, not a scan) and always shows the snapshot question text. Reports are worker-generated
  (exceljs + pdfkit), cached for an hour, and served via HMAC-signed, expiring download URLs.
- **Ports** moved off defaults to avoid collisions with other local projects (see §3).
- Native build scripts are explicitly allow-listed in `pnpm-workspace.yaml` (`allowBuilds`) per
  pnpm 11's supply-chain safety; the optional `msgpackr-extract` accelerator is declined (JS fallback).

## 10. Roadmap

1. **Foundation** — monorepo, auth, RBAC, org schema, student import, seed. ✅ **done**
2. **Org & assignment** — CRUD for faculty→offering (publicId-based), scoped teacher
   assignment (dept head own-dept only), audit on every mutation. ✅ **done**
3. **Exam & question authoring** — question banks (MCQ/written, manual + Excel import),
   exam builder, publish-time question snapshot, and the role-guarded status state machine
   with automatic time-based live/ended transitions. ✅ **done**
4. **Exam-taking engine** — server-authoritative deadline, cached paper delivery (no correct
   answers, deterministic per-student shuffle), autosave (UPSERT + Redis snapshot), single active
   session, idempotent + auto-submit, MCQ auto-grade from snapshot, k6 load test. ✅ **done**
5. Grading & reporting — **5a (backend)** ✅ **done**: written-answer marking (scope-guarded,
   validated against the snapshot marks, audited), auto-finalized `ExamResult` rollups with a
   per-question breakdown, dense-rank via a SQL window function, automatic transition to
   `results_published`, and overall + individual mark sheets (Excel via exceljs, PDF via pdfkit)
   generated by a BullMQ worker with idempotent caching + signed download URLs. **5b (frontend)**:
   web UI for exam-taking, authoring, org, grading, results — _pending_.
6. Hardening & polish (2FA, rate-limit lockout, maintenance mode, observability, backups, a11y, e2e).
