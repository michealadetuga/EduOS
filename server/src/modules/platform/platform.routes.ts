import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, pagination, parse } from '../../core/http.js';
import { requireAuth, requirePermission, requireRole } from '../../core/auth.middleware.js';
import { getDb, transaction } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { notFound } from '../../core/errors.js';
import { paged } from '../../core/tenantRepo.js';

/** Control plane. Separate from tenant routes; every school data access is logged with a reason. */
export const platformRouter = Router();
platformRouter.use(requireAuth, requireRole('SUPER_ADMIN'));

platformRouter.get('/dashboard', requirePermission('platform.schools.view'), asyncHandler(async (_req, res) => {
  const db = getDb();
  const c = (sql: string) => (db.prepare(sql).get() as any).c;
  res.json({
    totals: { schools: c('SELECT COUNT(*) c FROM schools'), active: c("SELECT COUNT(*) c FROM schools WHERE status='active'"), suspended: c("SELECT COUNT(*) c FROM schools WHERE status='suspended'"), pending: c("SELECT COUNT(*) c FROM schools WHERE status='pending'"),
      users: c('SELECT COUNT(*) c FROM users'), students: c('SELECT COUNT(*) c FROM students'), teachers: c('SELECT COUNT(*) c FROM teachers') },
    recent: db.prepare('SELECT id, code, name, status, type, created_at FROM schools ORDER BY id DESC LIMIT 8').all(),
    registrationsByMonth: db.prepare("SELECT substr(created_at,1,7) month, COUNT(*) c FROM schools GROUP BY month ORDER BY month DESC LIMIT 12").all(),
    activity: db.prepare("SELECT action, COUNT(*) c FROM audit_logs WHERE created_at > datetime('now','-7 days') GROUP BY action ORDER BY c DESC LIMIT 10").all(),
  });
}));

platformRouter.get('/schools', requirePermission('platform.schools.view'), asyncHandler(async (req, res) => {
  const { page, pageSize } = pagination(req.query as any);
  const params: unknown[] = []; const w: string[] = [];
  if (req.query.q) { w.push('(s.name LIKE ? OR s.code LIKE ? OR s.email LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
  if (req.query.status) { w.push('s.status = ?'); params.push(String(req.query.status)); }
  if (req.query.from) { w.push('s.created_at >= ?'); params.push(String(req.query.from)); }
  const where = w.length ? `WHERE ${w.join(' AND ')}` : '';
  const sql = `SELECT s.id, s.code, s.name, s.email, s.type, s.status, s.created_at,
    (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id) students, (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id) teachers,
    (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id) users FROM schools s ${where} ORDER BY s.id DESC`;
  res.json(paged(sql, `SELECT COUNT(*) c FROM schools s ${where}`, params, page, pageSize));
}));

/** Viewing a school's detail is a support access: reason required and logged. */
platformRouter.post('/schools/:id/access', requirePermission('platform.support.access'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const { reason } = parse(z.object({ reason: z.string().trim().min(5, 'Give a reason (min 5 chars)').max(300) }), req.body);
  const db = getDb();
  const s = db.prepare('SELECT * FROM schools WHERE id = ?').get(id) as any;
  if (!s) throw notFound('School not found');
  db.prepare('INSERT INTO support_access_logs (super_admin_id, school_id, reason) VALUES (?,?,?)').run(req.ctx!.userId, id, reason);
  audit({ schoolId: id, actorId: req.ctx!.userId, action: 'SUPPORT_ACCESS', entityType: 'school', entityId: id, metadata: { reason }, ip: req.ip });
  res.json({
    school: s,
    admins: db.prepare("SELECT id, first_name, last_name, email, status, email_verified, last_login_at FROM users WHERE school_id = ? AND role='SCHOOL_ADMIN'").all(id),
    counts: { students: (db.prepare('SELECT COUNT(*) c FROM students WHERE school_id = ?').get(id) as any).c, teachers: (db.prepare('SELECT COUNT(*) c FROM teachers WHERE school_id = ?').get(id) as any).c, classes: (db.prepare('SELECT COUNT(*) c FROM class_arms WHERE school_id = ?').get(id) as any).c },
    recentAudit: db.prepare('SELECT action, entity_type, created_at FROM audit_logs WHERE school_id = ? ORDER BY id DESC LIMIT 15').all(id),
    accessHistory: db.prepare('SELECT l.reason, l.created_at, u.email FROM support_access_logs l JOIN users u ON u.id = l.super_admin_id WHERE l.school_id = ? ORDER BY l.id DESC LIMIT 10').all(id),
  });
}));

platformRouter.post('/schools/:id/status', requirePermission('platform.schools.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const { status, reason } = parse(z.object({ status: z.enum(['active', 'suspended']), reason: z.string().trim().min(3).max(300) }), req.body);
  transaction(() => {
    const r = getDb().prepare("UPDATE schools SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    if (!r.changes) throw notFound('School not found');
    if (status === 'suspended') getDb().prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE school_id = ?)').run(id);
    audit({ schoolId: id, actorId: req.ctx!.userId, action: status === 'suspended' ? 'SCHOOL_SUSPENDED' : 'SCHOOL_REACTIVATED', entityType: 'school', entityId: id, metadata: { reason }, ip: req.ip });
  });
  res.json({ ok: true });
}));

platformRouter.get('/audit', requirePermission('audit.view'), asyncHandler(async (req, res) => {
  const { page, pageSize } = pagination(req.query as any);
  const sql = `SELECT a.*, u.email AS actor_email, s.name AS school_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN schools s ON s.id = a.school_id ORDER BY a.id DESC`;
  res.json(paged(sql, 'SELECT COUNT(*) c FROM audit_logs a', [], page, pageSize));
}));
