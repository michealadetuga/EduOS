# Security

## Authentication
* Passwords hashed with `scrypt` (per-user salt) in `core/crypto.ts`; minimum 8 chars with letter + number enforced by zod.
* Sessions: 32-byte random token, only its SHA-256 hash is stored; cookie `eduos_session` is `HttpOnly`, `SameSite=Lax`, `Secure` in production, 7-day TTL (configurable). Logout deletes the server session; password change/reset revokes all sessions.
* Email verification, password reset and invitations use single-use hashed tokens with expiry (`one_time_tokens`).
* Rate limiting on login, register, forgot-password and general API (`core/rateLimit.ts`); failed logins are audited. Login errors are generic ("Invalid email or password").
* `mustChangePassword` flag forces invited users to set their own password before using the app.

## Authorization
* Roles: `SUPER_ADMIN`, `SCHOOL_ADMIN`, `TEACHER`, `STUDENT`, `PARENT`. Each maps to a permission list (`core/rbac.ts`); routes declare `requirePermission('results.approve')` etc. The UI hides controls but the server is the source of truth.
* Teachers are additionally constrained to their assigned classes/subjects; students to their own records; parents to linked children only.
* Super admins never share tenant routes. Viewing a school's data requires `POST /api/platform/schools/:id/access` with a reason, which is written to `support_access_logs` and the audit log.

## Tenant isolation
See ARCHITECTURE.md. Key rule: `schoolId` always comes from the session, cross-tenant lookups return 404, and it is covered by automated tests.

## Input validation & errors
Every body/query is parsed with zod; validation failures return `422` with per-field messages. Unknown errors return `500` with a generic message; stack traces are logged server-side only.

## Files
Uploads are size-limited (`MAX_UPLOAD_MB`), MIME/extension-checked, stored outside the web root with random names under a per-school directory and streamed only through an authenticated, authorised endpoint.

## CSRF / XSS / headers
`helmet` sets security headers; state-changing requests require the `x-eduos-client` header (blocked cross-origin by browsers without CORS opt-in). React escapes output; no `dangerouslySetInnerHTML`.

## Audit
Security-relevant actions (login success/fail, password change, invitations, result transitions, approvals, publishes, imports, suspensions, support access…) are recorded with actor, entity, metadata and IP. Passwords/tokens are never logged.

## Production checklist
* Set a strong `AUTH_SECRET` (≥32 chars) — the server refuses to boot in production without it.
* Serve over HTTPS behind a reverse proxy; set `APP_URL`.
* Configure a real `EMAIL_PROVIDER`.
* Back up the SQLite file / storage directory (see DEPLOYMENT.md).
