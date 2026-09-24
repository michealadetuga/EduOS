/**
 * Lightweight domain event bus. Business logic emits events; notification handlers
 * subscribe. Keeps delivery channels decoupled from services.
 */
export type DomainEvent =
  | { type: 'USER_CREATED'; schoolId: number; userId: number; email: string; name: string; role: string; tempPassword?: string; inviteUrl?: string }
  | { type: 'RESULT_SUBMITTED'; schoolId: number; sheetId: number; teacherUserId: number | null }
  | { type: 'RESULT_APPROVED' | 'RESULT_REJECTED'; schoolId: number; sheetId: number; teacherUserId: number | null; note?: string }
  | { type: 'RESULT_PUBLISHED'; schoolId: number; sheetId: number; classArmId: number }
  | { type: 'ASSIGNMENT_POSTED'; schoolId: number; assignmentId: number; classArmId: number; title: string }
  | { type: 'ANNOUNCEMENT_PUBLISHED'; schoolId: number; announcementId: number; audience: string; title: string }
  | { type: 'SCHOOL_REGISTERED'; schoolId: number; email: string; name: string; verifyUrl: string }
  | { type: 'PASSWORD_RESET_REQUESTED'; userId: number; email: string; name: string; resetUrl: string };

type Handler = (e: DomainEvent) => void | Promise<void>;
const handlers: Handler[] = [];

export function subscribe(h: Handler) { handlers.push(h); }
export function emit(e: DomainEvent) {
  for (const h of handlers) {
    // Never let a notification failure break the business transaction.
    queueMicrotask(() => { try { void Promise.resolve(h(e)).catch(logErr); } catch (err) { logErr(err); } });
  }
}
const logErr = (err: unknown) => console.error('[events] handler failed', err instanceof Error ? err.message : err);
