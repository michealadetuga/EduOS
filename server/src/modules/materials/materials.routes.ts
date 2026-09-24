import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { conflict, forbidden, notFound } from '../../core/errors.js';
import { assertOwned } from '../../core/tenantRepo.js';
import { teacherIdOf } from '../results/results.service.js';
import { storeUpload, upload } from '../files/files.js';

export const materialsRouter = Router();
materialsRouter.use(requireTenant);

const schema = z.object({
  title: z.string().trim().min(2).max(140), description: z.string().trim().max(2000).optional(),
  classArmId: z.coerce.number().int().positive().optional().or(z.literal('')), subjectId: z.coerce.number().int().positive().optional().or(z.literal('')),
  category: z.enum(['note', 'textbook', 'slides', 'video', 'worksheet', 'past_question', 'other']).default('note'),
  externalUrl: z.string().url().max(500).optional().or(z.literal('')),
});

const select = `SELECT m.*, c.level, c.arm, s.name AS subject_name, t.first_name || ' ' || t.last_name AS teacher_name, f.original_name AS file_name, f.mime_type, f.size, a.name AS session_name
  FROM materials m LEFT JOIN class_arms c ON c.id = m.class_arm_id LEFT JOIN subjects s ON s.id = m.subject_id LEFT JOIN teachers t ON t.id = m.teacher_id LEFT JOIN files f ON f.id = m.file_id LEFT JOIN academic_sessions a ON a.id = m.session_id`;

/** Library = searchable, filterable view of materials the caller is allowed to see. */
materialsRouter.get('/', requirePermission('materials.view', 'library.view'), asyncHandler(async (req, res) => {
  const db = getDb(); const ctx = req.ctx!;
  const params: unknown[] = [req.schoolId]; let where = 'WHERE m.school_id = ?';
  if (ctx.role === 'STUDENT' || ctx.role === 'PARENT') {
    const sids = ctx.role === 'STUDENT' ? (db.prepare('SELECT id FROM students WHERE user_id = ?').all(ctx.userId) as any[]).map((r) => r.id)
      : (db.prepare('SELECT sp.student_id id FROM parents p JOIN student_parents sp ON sp.parent_id = p.id WHERE p.user_id = ?').all(ctx.userId) as any[]).map((r) => r.id);
    if (!sids.length) return res.json([]);
    where += ` AND (m.class_arm_id IS NULL OR m.class_arm_id IN (SELECT class_arm_id FROM enrollments WHERE student_id IN (${sids.map(() => '?').join(',')})))`; params.push(...sids);
  }
  const q = req.query as Record<string, string>;
  if (q.q) { where += ' AND (m.title LIKE ? OR m.description LIKE ?)'; params.push(`%${q.q}%`, `%${q.q}%`); }
  if (q.subjectId) { where += ' AND m.subject_id = ?'; params.push(Number(q.subjectId)); }
  if (q.classArmId) { where += ' AND m.class_arm_id = ?'; params.push(Number(q.classArmId)); }
  if (q.category) { where += ' AND m.category = ?'; params.push(q.category); }
  if (q.teacherId) { where += ' AND m.teacher_id = ?'; params.push(Number(q.teacherId)); }
  if (q.sessionId) { where += ' AND m.session_id = ?'; params.push(Number(q.sessionId)); }
  if (q.mine === '1' && ctx.role === 'TEACHER') { where += ' AND m.teacher_id = ?'; params.push(teacherIdOf(ctx)); }
  res.json(db.prepare(`${select} ${where} ORDER BY m.created_at DESC LIMIT 200`).all(...(params as any[])));
}));

materialsRouter.post('/', requirePermission('materials.manage'), upload.single('file'), asyncHandler(async (req, res) => {
  const m = parse(schema, req.body);
  const classArmId = m.classArmId || null; const subjectId = m.subjectId || null;
  assertOwned('class_arms', classArmId, req.schoolId, 'Class'); assertOwned('subjects', subjectId, req.schoolId, 'Subject');
  const tid = teacherIdOf(req.ctx!);
  if (req.ctx!.role === 'TEACHER' && classArmId && subjectId) {
    const ok = getDb().prepare('SELECT 1 FROM class_subjects WHERE class_arm_id = ? AND subject_id = ? AND teacher_id = ?').get(classArmId, subjectId, tid);
    if (!ok) throw forbidden('You are not assigned to this class subject');
  }
  const fileId = await storeUpload(req, 'materials');
  if (!fileId && !m.externalUrl) throw conflict('Attach a file or provide a link');
  const session = getDb().prepare("SELECT id FROM academic_sessions WHERE school_id = ? AND status='active'").get(req.schoolId) as any;
  const r = getDb().prepare('INSERT INTO materials (school_id, session_id, class_arm_id, subject_id, teacher_id, title, description, category, file_id, external_url) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(req.schoolId, session?.id ?? null, classArmId, subjectId, tid, m.title, m.description ?? null, m.category, fileId, m.externalUrl || null);
  const id = Number(r.lastInsertRowid);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'MATERIAL_UPLOADED', entityType: 'material', entityId: id, metadata: { title: m.title } });
  res.status(201).json({ id });
}));

materialsRouter.delete('/:id', requirePermission('materials.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const m = getDb().prepare('SELECT * FROM materials WHERE id = ? AND school_id = ?').get(id, req.schoolId) as any;
  if (!m) throw notFound('Material not found');
  if (req.ctx!.role === 'TEACHER' && m.teacher_id !== teacherIdOf(req.ctx!)) throw forbidden();
  getDb().prepare('DELETE FROM materials WHERE id = ?').run(id);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'MATERIAL_DELETED', entityType: 'material', entityId: id });
  res.json({ ok: true });
}));
