import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, pagination, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { conflict } from '../../core/errors.js';
import { getOwned, paged, updateOwned } from '../../core/tenantRepo.js';
import { authService } from '../auth/auth.service.js';
import { name } from '../auth/auth.schema.js';
import { env } from '../../config/env.js';

export const parentsRouter = Router();
parentsRouter.use(requireTenant);

const parentSchema = z.object({
  firstName: name, lastName: name,
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  createAccount: z.boolean().default(false),
  studentIds: z.array(z.number().int().positive()).max(20).optional(),
});

parentsRouter.get('/', requirePermission('parents.view'), asyncHandler(async (req, res) => {
  const { page, pageSize } = pagination(req.query as any);
  const params: unknown[] = [req.schoolId];
  let where = 'WHERE p.school_id = ?';
  if (req.query.q) { where += " AND (p.first_name || ' ' || p.last_name LIKE ? OR p.email LIKE ? OR p.phone LIKE ?)"; params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
  const sql = `SELECT p.*, u.status AS account_status,
    (SELECT GROUP_CONCAT(s.first_name || ' ' || s.last_name, ', ') FROM student_parents sp JOIN students s ON s.id = sp.student_id WHERE sp.parent_id = p.id) AS children
    FROM parents p LEFT JOIN users u ON u.id = p.user_id ${where} ORDER BY p.last_name, p.first_name`;
  res.json(paged(sql, `SELECT COUNT(*) c FROM parents p ${where}`, params, page, pageSize));
}));

parentsRouter.post('/', requirePermission('parents.manage'), asyncHandler(async (req, res) => {
  const p = parse(parentSchema, req.body);
  const db = getDb();
  if (p.email && db.prepare('SELECT 1 FROM parents WHERE school_id = ? AND email = ?').get(req.schoolId, p.email)) throw conflict('A parent with this email already exists');
  for (const sid of p.studentIds ?? []) getOwned('students', sid, req.schoolId, 'Student');
  let userId: number | null = null; let inviteUrl: string | undefined;
  if (p.createAccount) {
    if (!p.email) throw conflict('Email is required to create a parent account');
    const out = await authService.provisionUser({ schoolId: req.schoolId, role: 'PARENT', firstName: p.firstName, lastName: p.lastName, email: p.email, baseUrl: env.APP_URL || `${req.protocol}://${req.get('host')}`, actorId: req.ctx!.userId });
    userId = out.userId; inviteUrl = out.inviteUrl;
  }
  const r = db.prepare('INSERT INTO parents (school_id, user_id, first_name, last_name, email, phone) VALUES (?,?,?,?,?,?)').run(req.schoolId, userId, p.firstName, p.lastName, p.email ?? null, p.phone ?? null);
  const id = Number(r.lastInsertRowid);
  for (const sid of p.studentIds ?? []) db.prepare('INSERT OR IGNORE INTO student_parents (student_id, parent_id, school_id) VALUES (?,?,?)').run(sid, id, req.schoolId);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'PARENT_CREATED', entityType: 'parent', entityId: id, ip: req.ip });
  res.status(201).json({ id, inviteUrl });
}));

parentsRouter.get('/:id', requirePermission('parents.view'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const p = getOwned<any>('parents', id, req.schoolId, 'Parent');
  const children = getDb().prepare(`SELECT s.id, s.first_name, s.last_name, s.admission_no, sp.relationship FROM student_parents sp JOIN students s ON s.id = sp.student_id WHERE sp.parent_id = ? AND sp.school_id = ?`).all(id, req.schoolId);
  res.json({ ...p, children });
}));

parentsRouter.patch('/:id', requirePermission('parents.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const p = parse(parentSchema.partial().omit({ createAccount: true, studentIds: true }), req.body);
  updateOwned('parents', id, req.schoolId, { first_name: p.firstName, last_name: p.lastName, email: p.email, phone: p.phone }, 'Parent');
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'PARENT_UPDATED', entityType: 'parent', entityId: id, metadata: p });
  res.json({ ok: true });
}));

parentsRouter.post('/:id/account', requirePermission('parents.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const p = getOwned<any>('parents', id, req.schoolId, 'Parent');
  if (p.user_id) throw conflict('This parent already has an account');
  if (!p.email) throw conflict('Add an email address first');
  const out = await authService.provisionUser({ schoolId: req.schoolId, role: 'PARENT', firstName: p.first_name, lastName: p.last_name, email: p.email, baseUrl: env.APP_URL || `${req.protocol}://${req.get('host')}`, actorId: req.ctx!.userId });
  getDb().prepare('UPDATE parents SET user_id = ? WHERE id = ?').run(out.userId, id);
  res.status(201).json({ ok: true, inviteUrl: out.inviteUrl });
}));
