import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, pagination, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb, transaction } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { conflict } from '../../core/errors.js';
import { getOwned, paged, updateOwned } from '../../core/tenantRepo.js';
import { authService } from '../auth/auth.service.js';
import { email as emailSchema, name } from '../auth/auth.schema.js';
import { env } from '../../config/env.js';

export const teachersRouter = Router();
teachersRouter.use(requireTenant);

const teacherSchema = z.object({
  firstName: name, lastName: name, email: emailSchema,
  phone: z.string().trim().max(20).optional().nullable(),
  employmentStatus: z.enum(['full_time', 'part_time', 'contract', 'inactive']).default('full_time'),
  createAccount: z.boolean().default(true),
});

teachersRouter.get('/', requirePermission('teachers.view'), asyncHandler(async (req, res) => {
  const { page, pageSize } = pagination(req.query as any);
  const params: unknown[] = [req.schoolId];
  let where = 'WHERE t.school_id = ?';
  if (req.query.q) { where += " AND (t.first_name || ' ' || t.last_name LIKE ? OR t.email LIKE ?)"; params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  if (req.query.status) { where += ' AND t.employment_status = ?'; params.push(String(req.query.status)); }
  if (req.query.subjectId) { where += ' AND EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.teacher_id = t.id AND cs.subject_id = ?)'; params.push(Number(req.query.subjectId)); }
  if (req.query.classId) { where += ' AND EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.teacher_id = t.id AND cs.class_arm_id = ?)'; params.push(Number(req.query.classId)); }
  const sql = `SELECT t.*, u.status AS account_status, u.email_verified,
      (SELECT COUNT(*) FROM class_subjects cs WHERE cs.teacher_id = t.id) AS assignment_count
    FROM teachers t LEFT JOIN users u ON u.id = t.user_id ${where} ORDER BY t.last_name, t.first_name`;
  res.json(paged(sql, `SELECT COUNT(*) c FROM teachers t ${where}`, params, page, pageSize));
}));

teachersRouter.post('/', requirePermission('teachers.create'), asyncHandler(async (req, res) => {
  const t = parse(teacherSchema, req.body);
  const db = getDb();
  if (db.prepare('SELECT 1 FROM teachers WHERE school_id = ? AND email = ?').get(req.schoolId, t.email)) throw conflict('A teacher with this email already exists');
  const baseUrl = env.APP_URL || `${req.protocol}://${req.get('host')}`;
  let userId: number | null = null;
  let inviteUrl: string | undefined;
  if (t.createAccount) {
    const out = await authService.provisionUser({ schoolId: req.schoolId, role: 'TEACHER', firstName: t.firstName, lastName: t.lastName, email: t.email, baseUrl, actorId: req.ctx!.userId });
    userId = out.userId; inviteUrl = out.inviteUrl;
  }
  const r = db.prepare('INSERT INTO teachers (school_id, user_id, first_name, last_name, email, phone, employment_status) VALUES (?,?,?,?,?,?,?)')
    .run(req.schoolId, userId, t.firstName, t.lastName, t.email, t.phone ?? null, t.employmentStatus);
  const id = Number(r.lastInsertRowid);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'TEACHER_CREATED', entityType: 'teacher', entityId: id, metadata: { email: t.email }, ip: req.ip });
  res.status(201).json({ id, inviteUrl });
}));

teachersRouter.get('/:id', requirePermission('teachers.view'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const t = getOwned<any>('teachers', id, req.schoolId, 'Teacher');
  const assignments = getDb().prepare(`SELECT cs.id, c.id AS class_arm_id, c.level, c.arm, s.id AS subject_id, s.name AS subject_name, a.name AS session_name
    FROM class_subjects cs JOIN class_arms c ON c.id = cs.class_arm_id JOIN subjects s ON s.id = cs.subject_id JOIN academic_sessions a ON a.id = c.session_id
    WHERE cs.teacher_id = ? AND cs.school_id = ? ORDER BY a.name DESC, c.level, c.arm`).all(id, req.schoolId);
  const classTeacherOf = getDb().prepare("SELECT id, level, arm FROM class_arms WHERE class_teacher_id = ? AND school_id = ? AND status='active'").all(id, req.schoolId);
  res.json({ ...t, assignments, classTeacherOf });
}));

teachersRouter.patch('/:id', requirePermission('teachers.update'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const p = parse(teacherSchema.partial().omit({ createAccount: true, email: true }), req.body);
  const t = getOwned<any>('teachers', id, req.schoolId, 'Teacher');
  transaction(() => {
    updateOwned('teachers', id, req.schoolId, { first_name: p.firstName, last_name: p.lastName, phone: p.phone, employment_status: p.employmentStatus }, 'Teacher');
    if (t.user_id && p.employmentStatus) getDb().prepare('UPDATE users SET status = ? WHERE id = ?').run(p.employmentStatus === 'inactive' ? 'inactive' : 'active', t.user_id);
    if (t.user_id && p.employmentStatus === 'inactive') getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(t.user_id);
  });
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'TEACHER_UPDATED', entityType: 'teacher', entityId: id, metadata: p });
  res.json({ ok: true });
}));

teachersRouter.post('/:id/resend-invite', requirePermission('teachers.update'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const t = getOwned<any>('teachers', id, req.schoolId, 'Teacher');
  const baseUrl = env.APP_URL || `${req.protocol}://${req.get('host')}`;
  if (t.user_id) { await authService.forgotPassword(t.email, baseUrl); return res.json({ message: 'A password link was sent to the teacher.' }); }
  const out = await authService.provisionUser({ schoolId: req.schoolId, role: 'TEACHER', firstName: t.first_name, lastName: t.last_name, email: t.email, baseUrl, actorId: req.ctx!.userId });
  getDb().prepare('UPDATE teachers SET user_id = ? WHERE id = ?').run(out.userId, id);
  res.json({ message: 'Account created and invitation sent.', inviteUrl: out.inviteUrl });
}));

teachersRouter.delete('/:id', requirePermission('teachers.delete'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const t = getOwned<any>('teachers', id, req.schoolId, 'Teacher');
  // Soft-delete: keep historical results/attendance intact.
  transaction(() => {
    updateOwned('teachers', id, req.schoolId, { employment_status: 'inactive' });
    if (t.user_id) { getDb().prepare("UPDATE users SET status='inactive' WHERE id = ?").run(t.user_id); getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(t.user_id); }
  });
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'TEACHER_DEACTIVATED', entityType: 'teacher', entityId: id, ip: req.ip });
  res.json({ ok: true });
}));
