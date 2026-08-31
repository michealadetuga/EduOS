# EduOS Phase 1 Technical Specification

## 1. Product Definition

EduOS is a multi-tenant digital operating system for Nigerian secondary schools. Phase 1 focuses on school administration and the academic workflows that create the strongest foundation for teacher, student, and parent portals.

### Pilot customer

- One private secondary school
- Approximately 100-1,000 students
- Manual, spreadsheet, or WhatsApp-based workflows
- A school administrator available for onboarding and feedback

### Product promise

A school can set up its workspace, manage people and academic structures, run the result workflow, and communicate with its community from one platform.

## 2. Phase 1 Scope

### Included

- Email/password authentication
- Email verification and password reset
- School registration and school code
- School Admin and Super Admin roles
- Tenant context derived from the authenticated session
- School profile and onboarding progress
- Academic sessions and terms
- Classes and arms
- Subjects and class assignments
- Teachers, students, and parents
- Student enrollment by academic session and class arm
- Result entry, submission, approval, and publication
- Attendance recording
- School announcements
- Audit logs for sensitive changes
- Responsive admin and teacher workflows
- CSV student import with validation preview

### Deferred

- Fees and payments
- SMS, WhatsApp, and push notifications
- Virtual classrooms
- AI features
- Complex analytics
- Native mobile applications
- Government integrations
- Multi-campus management
- Database-per-school or microservices

## 3. System Architecture

```text
Browser
  |
  v
Express modular monolith
  |
  +-- Authentication and sessions
  +-- Tenant context and authorization
  +-- School setup
  +-- People and enrollment
  +-- Attendance
  +-- Results
  +-- Assignments and materials
  +-- Announcements and notifications
  +-- Audit
  |
  v
SQLite for pilot -> MongoDB Atlas pooled collections when scale requires it
```

The current pilot uses SQLite and a single Node.js deployment. This is appropriate while validating the product with one school. Domain modules should remain separated so a later database or deployment change does not require rewriting the user-facing workflows.

## 4. Tenant and Identity Model

Every authenticated request must resolve to a server-owned context:

```text
TenantContext
  userId
  schoolId
  role
  permissions
```

The client must never be trusted to choose `schoolId`. Query parameters, form fields, and request bodies may select resources within a tenant, but they must not establish tenant ownership.

### Authentication flow

```text
Request
  -> authenticate session
  -> load user and school status
  -> reject inactive or suspended school
  -> resolve TenantContext
  -> check permission
  -> execute tenant-scoped service
  -> write audit event when required
```

Super Admin is a control-plane role and is not represented as a school admin with a null school. Super Admin routes must be separate and must use explicit platform permissions.

## 5. Roles and Permissions

Permissions are the stable authorization contract. Roles map to permissions.

| Permission | School Admin | Teacher | Student | Parent | Super Admin |
|---|---:|---:|---:|---:|---:|
| `school.view` | yes | no | no | no | yes |
| `school.update` | yes | no | no | no | yes |
| `people.view` | yes | assigned only | self | children only | yes |
| `people.manage` | yes | no | no | no | yes |
| `attendance.record` | yes | assigned only | no | no | yes |
| `results.enter` | yes | assigned only | no | no | yes |
| `results.submit` | yes | yes | no | no | yes |
| `results.approve` | yes | no | no | no | yes |
| `results.publish` | yes | no | no | no | yes |
| `announcements.manage` | yes | no | no | no | yes |
| `audit.view` | school | no | no | no | platform |
| `schools.manage` | no | no | no | no | yes |

Authorization must be enforced on the server for every protected route. UI visibility is not authorization.

## 6. Data Model

All school-owned records contain `school_id` in SQLite. Future pooled MongoDB collections use `schoolId`.

### Core entities

- `School`: identity, code, profile, status, plan, and lifecycle timestamps.
- `User`: authentication identity, role, verification state, and school membership.
- `StudentProfile`: student-specific data linked to a User when the student receives an account.
- `TeacherProfile`: teacher-specific data linked to a User.
- `ParentProfile`: parent-specific data linked to a User when the parent receives an account.
- `AcademicSession`: school year such as `2026/2027`.
- `Term`: term within an academic session.
- `ClassArm`: class and arm, such as `SS2 A`.
- `Subject`: subject offered by a school.
- `Enrollment`: student membership in a class arm for one academic session.
- `Attendance`: student attendance for a class, date, and session/term.
- `Assessment`: assessment definition for a subject, class, session, and term.
- `Result`: student score associated with an assessment and workflow state.
- `Assignment`: teacher-created work assigned to a class or subject.
- `Material`: learning resource linked to a subject or assignment.
- `Announcement`: school message and audience.
- `AuditLog`: actor, action, resource, tenant, timestamp, and metadata.

### Required integrity rules

- A resource may only reference records from the same school.
- A student can have only one active enrollment for a class arm in a session.
- Historical enrollments must not be rewritten during promotion.
- Results must retain their session, term, class, subject, and assessment identity.
- Published results are immutable to teachers; corrections require an auditable admin action.
- Files must use tenant-aware object keys and authorization checks.

## 7. Result Workflow

```text
Draft
  -> Submitted by teacher
  -> Pending approval
  -> Approved by School Admin
  -> Published
```

Teachers may edit draft results and submit them. School Admins may approve, reject for correction, and publish. Students and parents may view only published results for an authorized student.

Every submission, approval, rejection, publication, and correction creates an audit event.

## 8. API Conventions

- JSON request and response bodies
- `/api/auth/*` for authentication
- `/api/school/*` for school-admin school setup
- `/api/people/*` for teachers, students, parents, and enrollment
- `/api/academics/*` for sessions, terms, classes, subjects, and results
- `/api/attendance/*` for attendance
- `/api/announcements/*` for announcements
- `/api/super-admin/*` for control-plane operations
- `401` for missing or invalid authentication
- `403` for insufficient permissions or inactive school
- `404` when a resource is absent or outside the tenant
- `422` for validation errors
- `409` for uniqueness or workflow conflicts

Protected endpoints must derive tenant scope from the session. A client-provided school identifier may be rejected rather than silently trusted.

## 9. Security Requirements

- Use `HttpOnly`, `SameSite=Lax`, `Secure` cookies in production.
- Hash passwords with bcrypt or a stronger approved password hashing algorithm.
- Store only hashes of session, verification, and reset tokens.
- Expire and revoke sessions consistently.
- Check school status on login and every authenticated request.
- Use parameterized SQL queries.
- Add tenant-aware joins and integrity checks for related records.
- Validate uploaded CSV files, size, encoding, headers, and row values.
- Do not expose temporary passwords in API responses.
- Keep audit logs append-only to normal school admins.
- Minimize collection of children's personal data.
- Define retention, export, deactivation, deletion, backup, and breach-response procedures before production use.

## 10. Pilot Acceptance Criteria

Phase 1 is ready for a pilot when one school can complete this journey:

1. Register school and verify the administrator email.
2. Log in and complete school setup.
3. Create an academic session, terms, classes, arms, and subjects.
4. Add a teacher and assign subjects/classes.
5. Import students from CSV and resolve validation errors.
6. Create or link parents and enroll students for the session.
7. Teacher records attendance and enters results for an assigned class.
8. Teacher submits results.
9. School Admin approves and publishes results.
10. Authorized student or parent views published results.
11. Admin views the audit trail.
12. A School A user cannot read, update, delete, or infer School B resources.

## 11. Required Test Coverage

Before pilot onboarding, add integration tests for:

- Authentication, verification, reset, logout, and session expiry
- Suspended school login and existing-session rejection
- Every protected route without a session
- School A attempting to access School B by ID
- Cross-school class, teacher, parent, and subject references
- Teacher access limited to assigned classes/subjects
- Result workflow state transitions
- Published result visibility for the correct student/parent only
- Audit events for sensitive mutations
- CSV import validation and duplicate admission numbers

## 12. Delivery Order

### Foundation

1. Centralize authentication and TenantContext middleware.
2. Add school-status checks and production cookie configuration.
3. Add permission definitions and server-side authorization helpers.
4. Add audit log storage and mutation events.

### Academic foundation

5. Add academic sessions, terms, and enrollments.
6. Replace permanent student class assignment with session-based enrollment.
7. Add attendance and result workflow tables/routes.

### Pilot readiness

8. Add CSV import preview and validation.
9. Add Super Admin control-plane routes.
10. Add cross-tenant integration tests.
11. Run a complete pilot workflow with one school.

## 13. Scale Boundary

Do not migrate to MongoDB, Redis, queues, or microservices solely because they are listed in the long-term architecture. Revisit the boundary when pilot usage demonstrates a real need such as high concurrent load, background processing volume, storage growth, or a tenant requiring dedicated infrastructure.

If MongoDB is introduced, use pooled shared collections with indexed `schoolId` fields. Keep tenant isolation in identity, authorization, queries, jobs, cache keys, reporting, and object-storage paths.
