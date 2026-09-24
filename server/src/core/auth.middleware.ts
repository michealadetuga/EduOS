import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { getDb } from '../db/connection.js';
import { env } from '../config/env.js';
import { sha256 } from './crypto.js';
import { forbidden, unauthorized } from './errors.js';
import { hasPermission, ROLE_PERMISSIONS, type Permission, type Role } from './rbac.js';
import type { TenantContext } from './context.js';

export const SESSION_COOKIE = 'eduos_session';
export const CSRF_HEADER = 'x-eduos-client';

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: env.isProd, path: '/',
    maxAge: env.SESSION_TTL_HOURS * 3600 * 1000,
  });
}
export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: env.isProd, path: '/' });
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

interface SessionRow {
  session_id: number; user_id: number; role: Role; school_id: number | null; email: string;
  first_name: string; last_name: string; user_status: string; must_change_password: number;
  expires_at: string; school_status: string | null;
}

/** Resolves identity + tenant from the session cookie. Never trusts client-provided school ids. */
export const authenticate: RequestHandler = (req, res, next) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return next();
  const row = getDb().prepare(`
    SELECT s.id AS session_id, s.expires_at, u.id AS user_id, u.role, u.school_id, u.email, u.first_name, u.last_name,
           u.status AS user_status, u.must_change_password, sc.status AS school_status
    FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN schools sc ON sc.id = u.school_id
    WHERE s.token_hash = ?`).get(sha256(token)) as SessionRow | undefined;
  if (!row || Date.parse(row.expires_at) < Date.now()) {
    if (row) getDb().prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    clearSessionCookie(res);
    return next();
  }
  if (row.user_status !== 'active') { clearSessionCookie(res); return next(forbidden('This account has been deactivated')); }
  if (row.school_id !== null && row.school_status !== 'active') {
    clearSessionCookie(res);
    return next(forbidden('School access is currently unavailable'));
  }
  const ctx: TenantContext = {
    userId: row.user_id, role: row.role, schoolId: row.school_id, sessionId: row.session_id, email: row.email,
    name: `${row.first_name} ${row.last_name}`, mustChangePassword: !!row.must_change_password,
  };
  req.ctx = ctx;
  req.perms = ROLE_PERMISSIONS[row.role];
  if (row.school_id !== null) req.schoolId = row.school_id;
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => (req.ctx ? next() : next(unauthorized()));

/** School-scoped modules: guarantees req.schoolId is set from the session. */
export const requireTenant: RequestHandler = (req, _res, next) => {
  if (!req.ctx) return next(unauthorized());
  if (req.ctx.schoolId === null) return next(forbidden('This action requires a school account'));
  req.schoolId = req.ctx.schoolId;
  next();
};

export const requirePermission = (...perms: Permission[]): RequestHandler => (req, _res, next) => {
  if (!req.ctx) return next(unauthorized());
  if (!perms.some((p) => hasPermission(req.ctx!.role, p))) return next(forbidden());
  next();
};

export const requireRole = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.ctx) return next(unauthorized());
  if (!roles.includes(req.ctx.role)) return next(forbidden());
  next();
};

/** CSRF defence for cookie auth: state-changing requests must carry a custom header (not settable cross-site without CORS). */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.headers[CSRF_HEADER]) return next();
  next(forbidden('Missing request verification header'));
};

export function can(req: Request, perm: Permission) { return !!req.ctx && hasPermission(req.ctx.role, perm); }
export function ipOf(req: Request) { return req.ip ?? null; }
export type { NextFunction };
