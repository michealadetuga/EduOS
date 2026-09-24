# EduOS — School Management & E-Learning Platform

Multi-tenant SaaS for Nigerian secondary schools: admissions, classes, teachers, students, parents, results workflow, attendance, assignments, learning materials, past-question practice, timetables, announcements, notifications, audit logs and a super-admin control plane.

> **Status:** v0.2 — the full Phase-1 product plus teacher, student and parent portals is implemented end-to-end (DB → service → API → authz → UI). See [docs/STATUS.md](docs/STATUS.md) for an honest feature-by-feature list and what remains.

## Quick start

```bash
npm install                 # installs server + web workspaces (Node 22+ required)
cp .env.example .env        # defaults work for local dev
npm run seed                # creates the SQLite DB and loads clearly-labelled demo data
npm run dev                 # API on :4000, Vite dev server on :5173 (proxies /api)
```

Production-style run (Express serves the built SPA):

```bash
npm run build && npm start  # http://localhost:4000
```

### Demo credentials (password for all: `Password123!`)

| Role | Email |
|---|---|
| Super admin (platform) | `super@eduos.dev` |
| School admin | `admin@greenfield.demo` |
| Teacher (class teacher JSS1 A) | `tunde.bakare@greenfield.demo` |
| Teacher | `ibrahim.sani@greenfield.demo` |
| Students | `student1@greenfield.demo` … `student12@greenfield.demo` |
| Parents | `parent1@greenfield.demo` … `parent6@greenfield.demo` |

The demo school is `Greenfield Secondary School (Demo)`, code `EDU-DEMO01`. Re-run `npm run seed -- --reset` to wipe and reload.

In development, emails (verification, invites, password resets) are written to `./outbox/` and the API also returns the link in the response so the UI can show it.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | API (tsx watch) + web (Vite) concurrently |
| `npm run build` | Build SPA to `web/dist` and typecheck server |
| `npm start` | Run API in production mode (serves `web/dist`) |
| `npm test` | Server test suite (auth, RBAC, results workflow, tenant isolation) |
| `npm run seed` | Load demo data (refuses to run in production) |
| `npm run typecheck` | `tsc --noEmit` for both workspaces |

## Repository layout

```
server/   Express 5 + TypeScript modular monolith (node:sqlite, zod, cookie sessions)
  src/core/       auth middleware, RBAC, tenant repo, audit, events, mailer, storage, rate limit
  src/modules/    auth, schools, academics, classes, subjects, teachers, students, parents,
                  results, attendance, assignments, materials, past-questions, timetable,
                  announcements, notifications, audit, platform (super admin), portal
  test/           node:test integration suites
web/      React 19 + TypeScript + Vite + Tailwind 4 SPA (admin / teacher / student / parent / platform)
docs/     architecture, security, deployment, status, Phase-1 spec
legacy/   the original prototype, kept for reference (not wired in)
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — modules, data model, tenancy, workflows
- [docs/SECURITY.md](docs/SECURITY.md) — auth, RBAC, tenant isolation, file access, OWASP notes
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — running in production, env vars, backups
- [docs/STATUS.md](docs/STATUS.md) — implemented vs. remaining, known limitations
- [docs/PHASE_1_SPEC.md](docs/PHASE_1_SPEC.md) — original Phase-1 specification

## Health

`GET /health` (alias `/api/health`) → `{ status: "ok", db: "ok", env, uptime, time }`.
