# Implementation status (v0.2)

Legend: ✅ complete end-to-end (DB + API + authz + UI + validation + states) · 🟡 foundation (API complete, UI minimal) · ⬜ not started

## Platform & security
| Area | Status | Notes |
|---|---|---|
| School registration, email verification, login/logout, forgot/reset, invites, forced password change | ✅ | Cookie sessions, rate limited, audited |
| RBAC with permission map, server-side enforcement | ✅ | 5 roles |
| Tenant isolation + automated isolation tests | ✅ | `server/test/tenant-isolation.test.ts` |
| Audit log (school + platform views) | ✅ | |
| Super-admin panel: dashboard, schools list, audited support access, suspend/reactivate | ✅ | |
| Notifications (in-app bell + email outbox/Resend) | ✅ | Event-driven |
| `/health`, central error handling, `.env.example`, seed script | ✅ | |

## School admin
| Area | Status |
|---|---|
| Onboarding wizard (profile → session/terms → classes → subjects → complete) | ✅ |
| Dashboard with real stats & pending approvals | ✅ |
| School profile, logo upload, grading scale editor | ✅ |
| Sessions & terms (activate, set current term, archive) | ✅ |
| Classes/arms, class teacher, subject–teacher assignment, roster | ✅ |
| Subjects (CRUD, bulk starter list) | ✅ |
| Teachers (CRUD, invite, resend invite, deactivate) | ✅ |
| Students (CRUD, enrollment model, account creation, archive) | ✅ |
| CSV import with validation preview | ✅ |
| Promotion / class movement with enrollment history | ✅ |
| Parents (CRUD, multi-child linking, login) | ✅ |
| Results: review, approve, reject with note, publish, reopen; report cards with comments & print | ✅ |
| Timetable builder (clash detection) | ✅ |
| Announcements with audiences | ✅ |
| Learning materials management | ✅ |
| Past-question bank | 🟡 API to add questions exists; admin UI to author questions not yet built (practice UI is complete) |

## Teacher portal
Dashboard, attendance marking, result sheet entry & submit, assignments + grading, materials upload, timetable, announcements — ✅

## Student portal
Dashboard, assignments + submission (text/file), published results/report card, attendance, library, past-question practice with scoring & explanations, timetable, announcements — ✅

## Parent portal
Children overview, per-child published report cards, per-child attendance, announcements — ✅

## Landing page
Marketing page with honest feature-status table — ✅

## Tests
22 server integration tests: auth flows, RBAC on results workflow, tenant isolation. ⬜ Frontend unit tests and browser e2e are not yet written (no headless browser in the build sandbox).

## Known limitations / remaining work
* Database is SQLite (see ARCHITECTURE.md) — the brief mentioned MongoDB Atlas, which was not reachable from the build environment.
* Past-question authoring UI, per-student result analytics charts, and bulk report-card PDF export are not implemented (print-to-PDF per student works).
* Email uses a local outbox by default; configure Resend for real delivery.
* No SMS/WhatsApp channel; no fees/payments module (out of Phase-1 scope).
* Frontend e2e tests to be added once a browser is available in CI.
