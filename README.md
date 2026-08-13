# University Examination System — University of Rajshahi

A secure, fast, reliable online examination system. Teachers author exams, admins
review and approve them, students take timed exams, MCQs are auto-graded, written
answers are routed to teachers, and admins/teachers generate mark sheets and reports.

**Design priorities, in order:** integrity → reliability → security → performance → clean modern UI.

> This is the repository entry point. Full setup, environment variables, run
> commands, and architecture notes live in **[`docs/README.md`](docs/README.md)**.

## Quick start

```bash
# 1. install dependencies (pnpm workspace)
pnpm install

# 2. bring up Postgres + Redis (+ PgBouncer) locally
pnpm infra:up

# 3. generate the Prisma client, run migrations, seed demo data
pnpm db:generate && pnpm db:migrate && pnpm db:seed

# 4. run api + worker + web together
pnpm dev
```

## Monorepo layout

```
apps/api      NestJS backend (REST API + BullMQ workers)
apps/web      React + Vite SPA (internal authenticated tool)
packages/types  shared TypeScript types + Zod schemas (@exam/types)
packages/config shared tsconfig / tailwind presets (@exam/config)
infra         docker-compose, nginx, prisma migrations
docs          setup, env vars, architecture decisions
```

## Build phases

This system is built in strict order (see `docs/README.md` → Roadmap):

1. **Foundation** — monorepo, auth, RBAC, org schema, student import, seed. ← _current_
2. Org & assignment CRUD + teacher assignment + audit.
3. Exam & question authoring + review/approval state machine.
4. Exam-taking engine (server timer, autosave, idempotent submit, MCQ auto-grade) + k6 load test.
5. Grading & reporting (written marking, result rollups, Excel/PDF export).
6. Hardening & polish (2FA, rate limiting, maintenance mode, observability, backups, a11y, e2e).
