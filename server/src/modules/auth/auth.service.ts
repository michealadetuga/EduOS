import crypto from 'node:crypto';
import { getDb, transaction } from '../../db/connection.js';
import { env } from '../../config/env.js';
import { hashPassword, randomToken, verifyPassword } from '../../core/crypto.js';
import { badRequest, conflict, forbidden, unauthorized } from '../../core/errors.js';
import { audit } from '../../core/audit.js';
import { emit } from '../../core/events.js';
import { authRepo } from './auth.repo.js';
import type { z } from 'zod';
import type { registerSchema } from './auth.schema.js';
import type { Role } from '../../core/rbac.js';

const VERIFY_TTL = 24 * 3600 * 1000;
const RESET_TTL = 60 * 60 * 1000;
const INVITE_TTL = 7 * 24 * 3600 * 1000;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generateSchoolCode() {
  const db = getDb();
  for (let i = 0; i < 20; i++) {
    const code = 'EDU-' + Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    if (!db.prepare('SELECT 1 FROM schools WHERE code = ?').get(code)) return code;
  }
  throw new Error('Could not generate school code');
}

export const authService = {
  async registerSchool(input: z.infer<typeof registerSchema>, baseUrl: string, ip: string | null) {
    if (authRepo.findUserByEmail(input.admin.email)) throw conflict('An account with this email already exists');
    const passwordHash = await hashPassword(input.admin.password);
    const token = randomToken();
    const { schoolId, userId, code } = transaction(() => {
      const code = generateSchoolCode();
      const r = getDb().prepare('INSERT INTO schools (code, name, address, email, phone, type) VALUES (?,?,?,?,?,?)')
        .run(code, input.school.name, input.school.address, input.school.email, input.school.phone, input.school.type);
      const schoolId = Number(r.lastInsertRowid);
      const userId = authRepo.createUser({ schoolId, role: 'SCHOOL_ADMIN', firstName: input.admin.firstName, lastName: input.admin.lastName, email: input.admin.email, passwordHash });
      authRepo.createToken(userId, 'verify', token, VERIFY_TTL);
      audit({ schoolId, actorId: userId, action: 'SCHOOL_REGISTERED', entityType: 'school', entityId: schoolId, metadata: { name: input.school.name }, ip });
      return { schoolId, userId, code };
    });
    const verifyUrl = `${baseUrl}/verify-email?token=${token}`;
    emit({ type: 'SCHOOL_REGISTERED', schoolId, email: input.admin.email, name: input.admin.firstName, verifyUrl });
    return { schoolId, userId, code, verifyUrl: env.isProd ? undefined : verifyUrl };
  },

  verifyEmail(token: string) {
    const row = authRepo.findToken('verify', token);
    if (!row) throw badRequest('This verification link is invalid');
    if (row.used_at) throw badRequest('This verification link was already used');
    if (Date.parse(row.expires_at) < Date.now()) throw badRequest('This verification link has expired');
    transaction(() => {
      authRepo.useToken(row.id);
      authRepo.markVerified(row.user_id);
      getDb().prepare("UPDATE schools SET status = 'active' WHERE status = 'pending' AND id = (SELECT school_id FROM users WHERE id = ?)").run(row.user_id);
      const u = authRepo.findUserById(row.user_id)!;
      audit({ schoolId: u.school_id, actorId: u.id, action: 'EMAIL_VERIFIED', entityType: 'user', entityId: u.id });
    });
  },

  async resendVerification(email: string, baseUrl: string) {
    const u = authRepo.findUserByEmail(email);
    if (!u || u.email_verified) return;
    const token = randomToken();
    authRepo.createToken(u.id, 'verify', token, VERIFY_TTL);
    emit({ type: 'SCHOOL_REGISTERED', schoolId: u.school_id!, email: u.email, name: u.first_name, verifyUrl: `${baseUrl}/verify-email?token=${token}` });
  },

  async login(email: string, password: string, ip: string | null, ua: string | null) {
    const u = authRepo.findUserByEmail(email);
    const generic = unauthorized('Incorrect email or password');
    if (!u) { await hashPassword('timing-equalizer'); audit({ schoolId: null, actorId: null, action: 'LOGIN_FAILED', metadata: { email }, ip }); throw generic; }
    if (u.locked_until && Date.parse(u.locked_until) > Date.now()) throw new (await import('../../core/errors.js')).HttpError(429, 'Too many failed attempts. Try again in a few minutes.', 'LOCKED');
    if (!(await verifyPassword(password, u.password_hash))) {
      authRepo.recordFailedLogin(u.id, LOCK_AFTER, LOCK_MS);
      audit({ schoolId: u.school_id, actorId: u.id, action: 'LOGIN_FAILED', entityType: 'user', entityId: u.id, ip });
      throw generic;
    }
    if (!u.email_verified) throw new (await import('../../core/errors.js')).HttpError(403, 'Please verify your email before signing in', 'EMAIL_NOT_VERIFIED');
    if (u.status !== 'active') throw forbidden('This account has been deactivated');
    if (u.school_id !== null) {
      const s = getDb().prepare('SELECT status FROM schools WHERE id = ?').get(u.school_id) as { status: string } | undefined;
      if (!s || s.status !== 'active') throw forbidden('School access is currently unavailable');
    }
    const token = randomToken();
    authRepo.createSession(u.id, token, env.SESSION_TTL_HOURS * 3600 * 1000, ip, ua);
    authRepo.resetFailedLogins(u.id);
    audit({ schoolId: u.school_id, actorId: u.id, action: 'LOGIN_SUCCESS', entityType: 'user', entityId: u.id, ip });
    return { token, user: u };
  },

  logout(token: string | undefined) { if (token) authRepo.deleteSessionByToken(token); },

  async forgotPassword(email: string, baseUrl: string) {
    const u = authRepo.findUserByEmail(email);
    if (!u) return;
    const token = randomToken();
    authRepo.createToken(u.id, 'reset', token, RESET_TTL);
    emit({ type: 'PASSWORD_RESET_REQUESTED', userId: u.id, email: u.email, name: u.first_name, resetUrl: `${baseUrl}/reset-password?token=${token}` });
  },

  async resetPassword(token: string, password: string, kind: 'reset' | 'invite' = 'reset') {
    const row = authRepo.findToken(kind, token);
    if (!row) throw badRequest('This link is invalid');
    if (row.used_at) throw badRequest('This link was already used');
    if (Date.parse(row.expires_at) < Date.now()) throw badRequest('This link has expired');
    const hash = await hashPassword(password);
    transaction(() => {
      authRepo.useToken(row.id);
      authRepo.setPassword(row.user_id, hash);
      authRepo.markVerified(row.user_id);
      authRepo.deleteUserSessions(row.user_id);
      const u = authRepo.findUserById(row.user_id)!;
      audit({ schoolId: u.school_id, actorId: u.id, action: kind === 'invite' ? 'INVITE_ACCEPTED' : 'PASSWORD_RESET', entityType: 'user', entityId: u.id });
    });
  },

  async changePassword(userId: number, current: string, next: string) {
    const u = authRepo.findUserById(userId)!;
    if (!(await verifyPassword(current, u.password_hash))) throw badRequest('Current password is incorrect');
    authRepo.setPassword(userId, await hashPassword(next));
    audit({ schoolId: u.school_id, actorId: userId, action: 'PASSWORD_CHANGED', entityType: 'user', entityId: userId });
  },

  /**
   * Used by admin modules to provision teacher/student/parent accounts.
   * Returns an invite URL (emailed via the notification layer) so no password ever travels in plain text.
   */
  async provisionUser(p: { schoolId: number; role: Role; firstName: string; lastName: string; email: string; baseUrl: string; actorId: number }) {
    if (authRepo.findUserByEmail(p.email)) throw conflict(`A user with email ${p.email} already exists`);
    const passwordHash = await hashPassword(randomToken(24));
    const userId = authRepo.createUser({ schoolId: p.schoolId, role: p.role, firstName: p.firstName, lastName: p.lastName, email: p.email, passwordHash, verified: false, mustChange: true });
    const token = randomToken();
    authRepo.createToken(userId, 'invite', token, INVITE_TTL);
    const inviteUrl = `${p.baseUrl}/accept-invite?token=${token}`;
    audit({ schoolId: p.schoolId, actorId: p.actorId, action: 'USER_CREATED', entityType: 'user', entityId: userId, metadata: { role: p.role, email: p.email } });
    emit({ type: 'USER_CREATED', schoolId: p.schoolId, userId, email: p.email, name: p.firstName, role: p.role, inviteUrl });
    return { userId, inviteUrl: env.isProd ? undefined : inviteUrl };
  },
};
