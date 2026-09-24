import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { conflict } from '../../core/errors.js';
import { assertOwned, getOwned, updateOwned } from '../../core/tenantRepo.js';
import { currentPeriod } from '../academics/academics.routes.js';

export const classesRouter = Router();
classesRouter.use(requireTenant);

export const LEVELS = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'] as const;

const classSchema = z.object({
  level: z.enum(LEVELS),
  arm: z.string().trim().min(1).max(20).default('A'),
  capacity: z.number().int().min(1).max(500).nullable().optional(),
  classTeacherId: z.number().int().positive().nullable().optional(),
  sessionId: z.number().int().positive().optional(),
});

const listSql = `
  SELECT c.*, t.first_name || ' ' || t.last_name AS class_teacher_name, s.name AS session_name,
    (SELECT COUNT(*) FROM enrollments e JOIN students st ON st.id = e.student_id WHERE e.class_arm_id = c.id AND st.status = 'active') AS student_count,
    (SELECT COUNT(*) FROM class_subjects cs WHERE cs.class_arm_id = c.id) AS subject_count
  FROM class_arms c LEFT JOIN teachers t ON t.id = c.class_teacher_id JOIN academic_sessions s ON s.id = c.session_id
  WHERE c.school_id = ?`;

classesRouter.get('/', requirePermission('classes.view'), asyncHandler(async (req, res) => {
  const params: unknown[] = [req.schoolId];
  let sql = listSql;
  if (req.query.sessionId) { sql += ' AND c.session_id = ?'; params.push(Number(req.query.sessionId)); }
  else if (req.query.all !== '1') { sql += " AND s.status = 'active'"; }
  if (req.query.status) { sql += ' AND c.status = ?'; params.push(String(req.query.status)); }
  sql += ' ORDER BY c.level, c.arm';
  res.json(getDb().prepare(sql).all(...(params as any[])));
}));

classesRouter.get('/levels', requirePermission('classes.view'), (_req, res) => res.json(LEVELS));

classesRouter.post('/', requirePermission('classes.manage'), asyncHandler(async (req, res) => {
  const input = parse(classSchema, req.body);
  const sessionId = input.sessionId ?? currentPeriod(req.schoolId).session.id;
  assertOwned('academic_sessions', sessionId, req.schoolId, 'Session');
  assertOwned('teachers', input.classTeacherId, req.schoolId, 'Teacher');
  const db = getDb();
  if (db.prepare('SELECT 1 FROM class_arms WHERE school_id = ? AND session_id = ? AND level = ? AND arm = ?').get(req.schoolId, sessionId, input.level, input.arm))
    throw conflict(`${input.level} ${input.arm} already exists in this session`);
  const r = db.prepare('INSERT INTO class_arms (school_id, session_id, level, arm, capacity, class_teacher_id) VALUES (?,?,?,?,?,?)')
    .run(req.schoolId, sessionId, input.level, input.arm, input.capacity ?? null, input.classTeacherId ?? null);
  const id = Number(r.lastInsertRowid);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'CLASS_CREATED', entityType: 'class_arm', entityId: id, metadata: { level: input.level, arm: input.arm } });
  res.status(201).json({ id });
}));

classesRouter.get('/:id', requirePermission('classes.view'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const cls = getDb().prepare(`${listSql} AND c.id = ?`).get(req.schoolId, id) as any;
  if (!cls) return res.status(404).json({ error: { message: 'Class not found' } });
  const subjects = getDb().prepare(`SELECT cs.id, cs.subject_id, s.name AS subject_name, s.code, cs.teacher_id, t.first_name || ' ' || t.last_name AS teacher_name
    FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id LEFT JOIN teachers t ON t.id = cs.teacher_id WHERE cs.class_arm_id = ? ORDER BY s.name`).all(id);
  const students = getDb().prepare(`SELECT st.id, st.admission_no, st.first_name, st.last_name, st.gender, st.status FROM enrollments e JOIN students st ON st.id = e.student_id
    WHERE e.class_arm_id = ? AND e.school_id = ? ORDER BY st.last_name, st.first_name`).all(id, req.schoolId);
  res.json({ ...cls, subjects, students });
}));

classesRouter.patch('/:id', requirePermission('classes.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const p = parse(classSchema.partial().extend({ status: z.enum(['active', 'archived']).optional() }), req.body);
  assertOwned('teachers', p.classTeacherId, req.schoolId, 'Teacher');
  updateOwned('class_arms', id, req.schoolId, { level: p.level, arm: p.arm, capacity: p.capacity, class_teacher_id: p.classTeacherId, status: p.status }, 'Class');
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'CLASS_UPDATED', entityType: 'class_arm', entityId: id, metadata: p });
  res.json({ ok: true });
}));

const assignSchema = z.object({ subjectId: z.number().int().positive(), teacherId: z.number().int().positive().nullable().optional() });
classesRouter.post('/:id/subjects', requirePermission('classes.manage', 'subjects.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  getOwned('class_arms', id, req.schoolId, 'Class');
  const { subjectId, teacherId } = parse(assignSchema, req.body);
  assertOwned('subjects', subjectId, req.schoolId, 'Subject');
  assertOwned('teachers', teacherId, req.schoolId, 'Teacher');
  getDb().prepare(`INSERT INTO class_subjects (school_id, class_arm_id, subject_id, teacher_id) VALUES (?,?,?,?)
    ON CONFLICT(class_arm_id, subject_id) DO UPDATE SET teacher_id = excluded.teacher_id`).run(req.schoolId, id, subjectId, teacherId ?? null);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'CLASS_SUBJECT_ASSIGNED', entityType: 'class_arm', entityId: id, metadata: { subjectId, teacherId } });
  res.status(201).json({ ok: true });
}));

classesRouter.delete('/:id/subjects/:subjectId', requirePermission('classes.manage', 'subjects.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  getDb().prepare('DELETE FROM class_subjects WHERE class_arm_id = ? AND subject_id = ? AND school_id = ?').run(id, idParam(req.params.subjectId as string, 'subjectId'), req.schoolId);
  res.json({ ok: true });
}));
