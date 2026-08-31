# eduOS — Technical Blueprint

> A multi-tenant digital operating system for Nigerian secondary schools — starting with
> administration and academic management, then growing into a complete learning and parent ecosystem.
>
> Status: living document. Each section is finalized before the code it governs.
> Source documents: `Secondary_School_ELMS_Discussion (2).pdf`, competitive/market review (Aug 2026),
> working prototype (`server.js`, `src/`, `pages/`).

---

## 1. Product Definition

### 1.1 What we are building
A **School Operating System**, not an LMS. Four layers on one record:

| Layer | Owner | Contents |
|---|---|---|
| Administration | School Admin | School setup, people, structure |
| Academics | Teachers + Admin | Classes, subjects, attendance, results |
| Learning | Students | Assignments, materials, past questions (WAEC/NECO/BECE/JAMB prep) |
| Visibility | Parents | Child progress, attendance, announcements |

### 1.2 Positioning
We do **not** win by out-featuring EDVES/SkoolDrive/Klas. We win on:
1. **Simplicity** — a school shouldn't need an IT department (onboarding wizard, CSV import).
2. **Nigerian context** — WAEC/NECO structures, low bandwidth, mobile teachers/parents.
3. **Learning layer** — student-facing usefulness (past questions, assignments), not just admin records.

Marketing sells outcomes ("your entire school, connected"), not feature counts.

### 1.3 First customer
One pilot school: private, ~100–1000 students, currently on paper/spreadsheets/WhatsApp,
with a hands-on administrator. Onboard manually. Sit with them. Fix what they struggle with.
Public self-service signup comes **after** the pilot proves the full journey.

---

## 2. System Architecture

### 2.1 Shape: modular monolith, two planes

```
                    ┌─────────────────────────────┐
                    │       CONTROL PLANE         │   Super Admin only
                    │  schools · status · plans   │
                    │  feature flags · audits     │
                    └──────────────┬──────────────┘
                                   │ oversight (audited)
      ┌────────────────────────────┼────────────────────────────┐
      │                            DATA PLANE                   │
      │   every query carries TenantContext { userId, schoolId,  │
      │   role, permissions } — resolved server-side only        │
      └────────────────────────────┬────────────────────────────┘
                                   │
        ┌───────┬───────┬──────┬───┴────┬────────┬─────────┐
     auth    schools academics people  results  comms    audit
```

- **Modular monolith**: one deployable backend, strict module boundaries (`src/routes/*` today;
  evolving to `src/modules/{auth,schools,academics,people,results,comms,audit}`). No microservices
  until a real scaling reason exists.
- **Control plane ≠ data plane**: Super Admin is a separate security boundary, never just
  "admin with `school_id = NULL`". Oversight access into a school is audited.

### 2.2 Request flow (the non-negotiable pipeline)

```
request
  → authenticate()          session cookie → user row
  → resolveTenant()         schoolId derived FROM THE USER ROW, never from input
  → authorize(permission)   role → permission map checked per endpoint
  → module handler(ctx)     receives TenantContext, cannot see raw query params for tenancy
  → repository              every WHERE clause includes school_id
```

Rules already enforced in code (`src/routes/auth.js`, `src/routes/admin.js`):
- `schoolId` is **never accepted** from the frontend, query string, or body.
- Every read/write is scoped: `WHERE id = ? AND school_id = ?`.
- Cross-school FK assignment is rejected (e.g., attaching another school's teacher to a class).

Rules to add (gap list):
- [ ] Central `TenantContext` object instead of ad-hoc `req.schoolId`.
- [ ] Permission strings (`students.create`, `results.approve`, …) replacing bare role checks.
- [ ] Automated cross-tenant test suite: for every endpoint, School B must get 404/403 on
      School A's resource IDs. Runs in CI. **Isolation regression = release blocker.**

### 2.3 Tenancy model
- **Pooled tenancy**: shared tables, `school_id` column on every school-owned row.
  No database-per-school, no collection-per-tenant. Documented escape hatch: if a large
  customer ever needs dedicated infrastructure, the control plane already tracks per-school
  metadata — migrate that tenant, don't rearchitect.
- Unique constraints are tenant-scoped: `(school_id, class_name, arm)`,
  `(school_id, admission_no)`, `(school_id, email)`.

### 2.4 Stack decisions (decision log)

| Decision | Choice | Rationale | Status |
|---|---|---|---|
| Production DB | **PostgreSQL (Render free tier)** | Relational fits Enrollments/junctions/constraints naturally; prototype schema ports 1:1; SQLite dev ≈ PG prod. *Advisory suggested Mongo Atlas — declined for v1; schema kept storage-agnostic.* | ✅ decided |
| Backend | Node.js + Express, modular monolith | Prototype proven; team knows it | ✅ decided |
| Local dev DB | SQLite via `node:sqlite` | Zero-setup; same SQL dialect surface we use | ✅ decided |
| Frontend hosting | Vercel (static pages + assets) | Per source doc | ✅ decided |
| Backend hosting | Render web service | Per source doc | ✅ decided |
| File storage | Object storage (Cloudflare R2 / AWS S3), tenant-prefixed keys `school/{schoolId}/…` | Never store blobs in DB; URLs must be tenant-checked too | 📋 Phase 1D+ |
| Email | Transactional provider (Resend/Postmark) behind notification module; dev = `outbox/` files | Swap point isolated in `src/mailer.js` | 🔁 swap pending |
| Sessions | Server-side session table + HttpOnly cookie (not JWT) | Instant revocation (already used on password reset) | ✅ decided |
| Monitoring | Error tracking + request logs from day one (Sentry free tier) | Cheap insurance | 📋 Phase 1E |

---

## 3. Domain Model (target)

Separation principles from the review, adopted:

- **`User` ≠ profile.** `users` holds credentials + role. `teachers`, `students`, `parents`
  are profiles that may link to a `user_id`. A student need not have login credentials;
  a parent links many children; nothing is lost when accounts are added later.
- **`Enrollment` replaces permanent class attachment.**

```
School ─┬─ AcademicSession ─┬─ Term
        ├─ ClassArm ──┐
        ├─ Subject ───┤
        ├─ Teacher ───┤
        ├─ Parent ─┐  │
        ├─ Student ┴──┤
        │             ↓
        ├────── Enrollment (student × session × class_arm)   ← promotion = new row
        ├─ Attendance (enrollment × date)
        ├─ Assessment/Result (enrollment × subject × term, state machine below)
        ├─ Assignment · Material · Timetable
        ├─ Announcement
        └─ AuditLog
```

### Result state machine (Phase 1D contract, built for Phase 2 entry)
```
draft → teacher_submitted → admin_approved → published
                ↑ rejected back to draft (with comment, audited)
```

### Schema migration queue (from current prototype)
| Change | Why |
|---|---|
| add `academic_sessions(id, school_id, name, is_current)` + `terms` | Session/term settings become structural, not text fields |
| add `enrollments(student_id, session_id, class_arm_id)` | Promotion/history without rewriting records |
| move `students.class_arm_id` → derived from current enrollment | Historical accuracy |
| add `audit_logs(id, school_id, actor_user_id, action, entity, entity_id, before_json, after_json, created_at)` | "Who changed this result?" must always have an answer |
| add `permissions` mapping (code-level role→permission map is fine to start) | Replace scattered role checks |

---

## 4. Authentication & RBAC

Built and tested: signup→verify→login, session cookies, email verification gate,
password reset (invalidates all sessions), teacher account creation with temp credentials,
role-aware redirects, protected pages/APIs.

To finalize in spec §4 (next artifact):
- Password policy details, rate limiting on auth endpoints
- Full permission matrix (roles × permissions) incl. `results.enter/submit/approve/publish`
- Super Admin: separate boundary, seeded account, audited support access

## 5. API Conventions
- REST, JSON; errors `{ "error": string }`; auth via cookie; all list endpoints scoped implicitly.
- Endpoint inventory lives with each module spec (§ per module as built).

## 6. Frontend Structure
- Vanilla HTML/CSS/JS SPA shells today (landing, auth pages, admin app).
- Design tokens: ink `#153c39`, soft `#f7f4ed`, coral `#f36648`, yellow `#f9c854`; DM Sans + Fraunces.
- Device targets: Admin desktop-first responsive; Teacher tablet/mobile; Parent mobile-first.
- Critical-flow offline tolerance (attendance, result entry): queue-and-sync pattern, Phase 2 design requirement.

## 7. Deployment Architecture
```
Vercel (static) ──► Render (Express) ──► Render Postgres
                          │
                          ├── object storage (files, tenant-prefixed)
                          └── email provider (via notification module)
```
Environments: local (SQLite) → Render staging → production. Secrets via env vars only.

## 8. Security & Privacy (NDPC-aware, children's data)
Encryption in transit; bcrypt passwords; tenant isolation tests; audit logs; data minimization;
retention rules; export/deletion process; breach response note; **get Nigerian legal advice
before production launch** — DPIA territory for student records.

## 9. Phase Plan (strict scope)

| Phase | Contents | Exit criteria |
|---|---|---|
| 0 Foundation | name, landing, spec, repo hygiene, envs | this document approved |
| **1A Platform** | auth, roles, school creation + ID, isolation, verification, both admins | a second school cannot touch school #1 anywhere (automated) |
| **1B Setup** | profile, sessions/terms, classes/arms, subjects | structure creatable end-to-end |
| **1C People** | teachers, students, parents, CSV import, accounts | 800-student import works with preview/validation |
| **1D Academic admin** | result entry skeleton, approval flow, report card, announcements | draft→published chain demonstrable |
| **1E Operations** | audit logs, suspension, monitoring, backups | suspension actually cuts access |
| 2 Teacher · 3 Student · 4 Parent | per source doc | pilot-school journey complete |
| 5 Business/scale | fees, SMS, subscriptions… | only after real usage |

Explicitly OUT until Phase 5: virtual classes, fees/payments, SMS/WhatsApp, AI, mobile apps,
government reporting, analytics dashboards.

## 10. Open Questions
1. Product name final? ("eduOS" placeholder)
2. Pilot school candidate identified?
3. Past-questions licensing approach (original content vs licensed bank)?
4. Subscription tiers — defer pricing until pilot interviews done.
