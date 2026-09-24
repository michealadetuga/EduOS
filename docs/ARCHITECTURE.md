# Architecture

## Overview

EduOS is a **modular monolith**: one Express 5 (TypeScript, ESM) process exposing a JSON API under `/api/*` and serving the compiled React SPA for every other route. Each business area lives in `server/src/modules/<area>/` with its own router, validation schemas and service functions; shared cross-cutting concerns live in `server/src/core/`.

```
Browser (React SPA) ──cookies──▶ Express API ──▶ SQLite (node:sqlite)
                                     │
                                     ├─▶ events ─▶ notifications ─▶ mailer (outbox | Resend)
                                     ├─▶ audit log
                                     └─▶ storage (local, tenant-scoped paths)
```

## Request pipeline

1. `helmet`, JSON body parsing, cookie parsing, per-route rate limiting.
2. `requireAuth` — looks up the hashed session cookie (`eduos_session`), loads the user, school and permission set into `req.ctx`; rejects suspended schools/users.
3. CSRF defence — all mutating requests must carry the custom `x-eduos-client` header (cookies are `SameSite=Lax`, `HttpOnly`).
4. `requirePermission('...')` / `requireRole(...)` — permission map in `core/rbac.ts`.
5. Handler: `parse(zodSchema, req.body)` → service → `res.json`. Errors flow to a central handler that returns `{ error: { code, message, details? } }` and never leaks stack traces in production.

## Tenancy

* Every tenant row carries `school_id`. `req.schoolId` is derived **only** from the authenticated session; any `schoolId` sent by a client is ignored.
* `core/tenantRepo.ts` provides `getOwned(table, id, schoolId)` and list helpers that always add the `school_id` predicate. Cross-tenant IDs resolve to `404`, never `403`, so tenants cannot probe each other's ID space.
* Teacher-scoped rules (`assertTeacherHasClass`, `assertTeacherOwnsSheet`) further restrict TEACHER users to the classes/subjects assigned to them.
* Uploaded files are stored at `storage/school/{schoolId}/{area}/{uuid}` and served only via `GET /api/files/:id` after an ownership + audience check. There are no public file URLs.
* `server/test/tenant-isolation.test.ts` registers two schools and asserts that every cross-tenant read/write fails.

## Data model (SQLite, `server/src/db/schema.ts`)

Core: `schools`, `users`, `sessions`, `one_time_tokens`, `audit_logs`, `support_access_logs`, `notifications`.
Academic: `academic_sessions`, `terms`, `class_arms`, `subjects`, `class_subjects` (teacher assignment), `teachers`, `students`, `enrollments` (student ↔ class ↔ session, with promotion outcome), `parents`, `student_parents`.
Learning: `result_sheets` → `result_entries`, `report_card_comments`, `attendance`, `assignments` → `assignment_submissions`, `learning_materials`, `files`, `past_questions`, `practice_attempts`, `timetable_entries`, `announcements`.

Grading scale (CA1/CA2/exam maxima and grade bands) is JSON on the `schools` row and editable by the school admin.

## Results workflow

```
DRAFT ──submit──▶ SUBMITTED ──approve──▶ APPROVED ──publish──▶ PUBLISHED
  ▲                  │                      │                      │
  └──── reject ◀─────┴──────────────────────┘        reopen ◀──────┘
```
* Teachers can only edit sheets in `DRAFT`/`REJECTED`; submission requires complete scores for every enrolled student.
* Only `SCHOOL_ADMIN` can approve/reject/publish/reopen; each transition is audited and emits an event.
* Students and parents call `reportCard(..., publishedOnly=true)` — unpublished scores never leave the server.

## Events & notifications

`core/events.ts` is a small in-process emitter. Modules `emit({type: 'RESULT_PUBLISHED' | 'ASSIGNMENT_POSTED' | 'ANNOUNCEMENT_POSTED' | ...})`; the notifications module fans out to in-app notifications and email via `core/mailer.ts`. Swapping in a queue later only requires changing `emit`.

## Frontend

`web/` — React 19 + react-router 7 + Tailwind 4. `lib/api.ts` is a thin fetch wrapper (credentials included, CSRF header, typed error → field errors). `lib/auth.tsx` loads `/api/auth/me` and gates routes by role; `RequireOnboarded` funnels new schools into the setup wizard. Each role has its own shell/nav (`App.tsx`). Shared pages (results sheet, report card, announcements, library, audit) adapt to the caller's permissions rather than being duplicated.

## Why SQLite?

The build brief mentioned MongoDB Atlas, but this sandbox has no network/Mongo access. All data access is behind small repository helpers so swapping the store is localised, and SQLite (via Node's built-in `node:sqlite`) gives real transactions, foreign keys and zero-ops deployment for a single-region school SaaS. See DEPLOYMENT.md for the Postgres migration path.
