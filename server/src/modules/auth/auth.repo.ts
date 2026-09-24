import { getDb } from '../../db/connection.js';
import { sha256 } from '../../core/crypto.js';
import type { Role } from '../../core/rbac.js';

export interface UserRow {
  id: number; school_id: number | null; role: Role; first_name: string; last_name: string; email: string;
  password_hash: string; email_verified: number; status: string; must_change_password: number;
  failed_logins: number; locked_until: string | null; created_at: string;
}

export const authRepo = {
  findUserByEmail: (email: string) => getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined,
  findUserById: (id: number) => getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined,
  createUser(u: { schoolId: number | null; role: Role; firstName: string; lastName: string; email: string; passwordHash: string; verified?: boolean; mustChange?: boolean }) {
    const r = getDb().prepare(`INSERT INTO users (school_id, role, first_name, last_name, email, password_hash, email_verified, must_change_password)
      VALUES (?,?,?,?,?,?,?,?)`).run(u.schoolId, u.role, u.firstName, u.lastName, u.email, u.passwordHash, u.verified ? 1 : 0, u.mustChange ? 1 : 0);
    return Number(r.lastInsertRowid);
  },
  createToken(userId: number, kind: 'verify' | 'reset' | 'invite', token: string, ttlMs: number) {
    getDb().prepare('INSERT INTO auth_tokens (user_id, kind, token_hash, expires_at) VALUES (?,?,?,?)')
      .run(userId, kind, sha256(token), new Date(Date.now() + ttlMs).toISOString());
  },
  findToken(kind: string, token: string) {
    return getDb().prepare('SELECT * FROM auth_tokens WHERE kind = ? AND token_hash = ?').get(kind, sha256(token)) as
      | { id: number; user_id: number; expires_at: string; used_at: string | null } | undefined;
  },
  useToken: (id: number) => getDb().prepare("UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?").run(id),
  createSession(userId: number, token: string, ttlMs: number, ip: string | null, ua: string | null) {
    const r = getDb().prepare('INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent) VALUES (?,?,?,?,?)')
      .run(userId, sha256(token), new Date(Date.now() + ttlMs).toISOString(), ip, ua?.slice(0, 200) ?? null);
    return Number(r.lastInsertRowid);
  },
  deleteSessionByToken: (token: string) => getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token)),
  deleteUserSessions: (userId: number) => getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId),
  setPassword: (userId: number, hash: string) =>
    getDb().prepare("UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?").run(hash, userId),
  markVerified: (userId: number) => getDb().prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId),
  recordFailedLogin(userId: number, lockAfter: number, lockMs: number) {
    const db = getDb();
    db.prepare('UPDATE users SET failed_logins = failed_logins + 1 WHERE id = ?').run(userId);
    const u = db.prepare('SELECT failed_logins FROM users WHERE id = ?').get(userId) as { failed_logins: number };
    if (u.failed_logins >= lockAfter)
      db.prepare('UPDATE users SET locked_until = ?, failed_logins = 0 WHERE id = ?').run(new Date(Date.now() + lockMs).toISOString(), userId);
  },
  resetFailedLogins: (userId: number) =>
    getDb().prepare("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?").run(userId),
};
