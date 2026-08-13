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

Phase-1 unit tests cover the student-import row validator, scoped-RBAC logic, and argon2
hash/verify. The critical exam-taking path (server timer, autosave, idempotent submit, auto-submit,
MCQ auto-grade) is tested thoroughly in phase 4, plus a k6 load test of the submit path.

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
4. Exam-taking engine (server timer, autosave, idempotent submit, MCQ auto-grade) + k6 load test.
5. Grading & reporting (written marking, result rollups, Excel/PDF export).
6. Hardening & polish (2FA, rate-limit lockout, maintenance mode, observability, backups, a11y, e2e).
