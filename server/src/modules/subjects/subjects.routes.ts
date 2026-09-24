import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { conflict } from '../../core/errors.js';
import { updateOwned } from '../../core/tenantRepo.js';

export const subjectsRouter = Router();
subjectsRouter.use(requireTenant);

const subjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().max(12).optional().nullable(),
  kind: z.enum(['core', 'elective']).default('core'),
  track: z.enum(['science', 'art', 'commercial', 'general']).optional().nullable(),
});

subjectsRouter.get('/', requirePermission('subjects.view'), asyncHandler(async (req, res) => {
  const rows = getDb().prepare(`SELECT s.*,
      (SELECT COUNT(DISTINCT cs.class_arm_id) FROM class_subjects cs JOIN class_arms c ON c.id = cs.class_arm_id JOIN academic_sessions a ON a.id = c.session_id AND a.status='active' WHERE cs.subject_id = s.id) AS class_count,
      (SELECT COUNT(DISTINCT cs.teacher_id) FROM class_subjects cs WHERE cs.subject_id = s.id AND cs.teacher_id IS NOT NULL) AS teacher_count
    FROM subjects s WHERE s.school_id = ? ${req.query.status ? 'AND s.status = ?' : ''} ORDER BY s.name`)
    .all(...([req.schoolId, ...(req.query.status ? [String(req.query.status)] : [])] as any[]));
  res.json(rows);
}));

subjectsRouter.post('/', requirePermission('subjects.manage'), asyncHandler(async (req, res) => {
  const s = parse(subjectSchema, req.body);
  if (getDb().prepare('SELECT 1 FROM subjects WHERE school_id = ? AND name = ? COLLATE NOCASE').get(req.schoolId, s.name)) throw conflict(`${s.name} already exists`);
  const r = getDb().prepare('INSERT INTO subjects (school_id, name, code, kind, track) VALUES (?,?,?,?,?)').run(req.schoolId, s.name, s.code ?? null, s.kind, s.track ?? null);
  const id = Number(r.lastInsertRowid);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'SUBJECT_CREATED', entityType: 'subject', entityId: id, metadata: { name: s.name } });
  res.status(201).json({ id });
}));

subjectsRouter.post('/bulk', requirePermission('subjects.manage'), asyncHandler(async (req, res) => {
  const { subjects } = parse(z.object({ subjects: z.array(subjectSchema).min(1).max(60) }), req.body);
  const db = getDb();
  let created = 0;
  for (const s of subjects) {
    const r = db.prepare('INSERT OR IGNORE INTO subjects (school_id, name, code, kind, track) VALUES (?,?,?,?,?)').run(req.schoolId, s.name, s.code ?? null, s.kind, s.track ?? null);
    created += Number(r.changes);
  }
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'SUBJECTS_BULK_CREATED', entityType: 'subject', metadata: { created } });
  res.status(201).json({ created });
}));

subjectsRouter.patch('/:id', requirePermission('subjects.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const p = parse(subjectSchema.partial().extend({ status: z.enum(['active', 'archived']).optional() }), req.body);
  updateOwned('subjects', id, req.schoolId, { name: p.name, code: p.code, kind: p.kind, track: p.track, status: p.status }, 'Subject');
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'SUBJECT_UPDATED', entityType: 'subject', entityId: id, metadata: p });
  res.json({ ok: true });
}));

subjectsRouter.get('/:id/classes', requirePermission('subjects.view'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  res.json(getDb().prepare(`SELECT cs.id, c.id AS class_arm_id, c.level, c.arm, cs.teacher_id, t.first_name || ' ' || t.last_name AS teacher_name
    FROM class_subjects cs JOIN class_arms c ON c.id = cs.class_arm_id LEFT JOIN teachers t ON t.id = cs.teacher_id
    WHERE cs.subject_id = ? AND cs.school_id = ? ORDER BY c.level, c.arm`).all(id, req.schoolId));
}));
