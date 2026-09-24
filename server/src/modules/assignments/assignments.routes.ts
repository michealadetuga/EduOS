import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { emit } from '../../core/events.js';
import { conflict, forbidden, notFound } from '../../core/errors.js';
import { getOwned } from '../../core/tenantRepo.js';
import { teacherIdOf } from '../results/results.service.js';
import { storeUpload, upload } from '../files/files.js';

export const assignmentsRouter = Router();
assignmentsRouter.use(requireTenant);

const createSchema = z.object({
  classArmId: z.coerce.number().int().positive(), subjectId: z.coerce.number().int().positive(),
  title: z.string().trim().min(2).max(140), description: z.string().trim().max(5000).optional(),
  dueAt: z.string().datetime({ offset: true }).optional().or(z.literal('')), maxScore: z.coerce.number().min(1).max(1000).default(10),
  publish: z.coerce.boolean().default(false),
});

function studentIdsOf(req: any): number[] {
  const db = getDb();
  if (req.ctx.role === 'STUDENT') return (db.prepare('SELECT id FROM students WHERE user_id = ? AND school_id = ?').all(req.ctx.userId, req.schoolId) as any[]).map((r) => r.id);
  if (req.ctx.role === 'PARENT') return (db.prepare('SELECT sp.student_id AS id FROM parents p JOIN student_parents sp ON sp.parent_id = p.id WHERE p.user_id = ? AND p.school_id = ?').all(req.ctx.userId, req.schoolId) as any[]).map((r) => r.id);
  return [];
}

const listCols = `SELECT a.*, c.level, c.arm, s.name AS subject_name, t.first_name || ' ' || t.last_name AS teacher_name, f.original_name AS file_name,
  (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id) AS submission_count,
  (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id AND sub.status = 'graded') AS graded_count`;
const listFrom = ` FROM assignments a JOIN class_arms c ON c.id = a.class_arm_id JOIN subjects s ON s.id = a.subject_id JOIN teachers t ON t.id = a.teacher_id LEFT JOIN files f ON f.id = a.file_id`;
const listSelect = listCols + listFrom;

assignmentsRouter.get('/', requirePermission('assignments.view'), asyncHandler(async (req, res) => {
  const db = getDb();
  const ctx = req.ctx!;
  if (ctx.role === 'TEACHER') return res.json(db.prepare(`${listSelect} WHERE a.school_id = ? AND a.teacher_id = ? ORDER BY a.created_at DESC`).all(req.schoolId, teacherIdOf(ctx)));
  if (ctx.role === 'STUDENT') {
    const sids = studentIdsOf(req);
    if (!sids.length) return res.json([]);
    return res.json(db.prepare(`${listCols}, (SELECT status FROM assignment_submissions sub WHERE sub.assignment_id = a.id AND sub.student_id = ?) AS my_status,
      (SELECT score FROM assignment_submissions sub WHERE sub.assignment_id = a.id AND sub.student_id = ?) AS my_score ${listFrom}
      WHERE a.school_id = ? AND a.status != 'draft' AND a.class_arm_id IN (SELECT class_arm_id FROM enrollments WHERE student_id = ?) ORDER BY a.due_at IS NULL, a.due_at`).all(sids[0], sids[0], req.schoolId, sids[0]));
  }
  const params: unknown[] = [req.schoolId]; let where = 'WHERE a.school_id = ?';
  if (req.query.classArmId) { where += ' AND a.class_arm_id = ?'; params.push(Number(req.query.classArmId)); }
  res.json(db.prepare(`${listSelect} ${where} ORDER BY a.created_at DESC LIMIT 200`).all(...(params as any[])));
}));

assignmentsRouter.post('/', requirePermission('assignments.manage'), upload.single('file'), asyncHandler(async (req, res) => {
  const a = parse(createSchema, req.body);
  const tid = teacherIdOf(req.ctx!);
  if (!tid) throw forbidden('Only teachers can create assignments');
  const assigned = getDb().prepare('SELECT 1 FROM class_subjects WHERE class_arm_id = ? AND subject_id = ? AND teacher_id = ? AND school_id = ?').get(a.classArmId, a.subjectId, tid, req.schoolId);
  if (!assigned) throw forbidden('You are not assigned to teach this subject in this class');
  const fileId = await storeUpload(req, 'assignments');
  const term = getDb().prepare("SELECT t.id FROM terms t JOIN class_arms c ON c.session_id = t.session_id WHERE c.id = ? AND t.is_current = 1").get(a.classArmId) as any;
  const r = getDb().prepare('INSERT INTO assignments (school_id, class_arm_id, subject_id, teacher_id, term_id, title, description, file_id, due_at, max_score, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(req.schoolId, a.classArmId, a.subjectId, tid, term?.id ?? null, a.title, a.description ?? null, fileId, a.dueAt || null, a.maxScore, a.publish ? 'published' : 'draft');
  const id = Number(r.lastInsertRowid);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'ASSIGNMENT_CREATED', entityType: 'assignment', entityId: id, metadata: { title: a.title, published: a.publish } });
  if (a.publish) emit({ type: 'ASSIGNMENT_POSTED', schoolId: req.schoolId, assignmentId: id, classArmId: a.classArmId, title: a.title });
  res.status(201).json({ id });
}));

function loadAssignment(req: any, id: number) {
  const a = getDb().prepare(`${listSelect} WHERE a.id = ? AND a.school_id = ?`).get(id, req.schoolId) as any;
  if (!a) throw notFound('Assignment not found');
  const ctx = req.ctx;
  if (ctx.role === 'TEACHER' && a.teacher_id !== teacherIdOf(ctx)) throw forbidden();
  if (ctx.role === 'STUDENT' || ctx.role === 'PARENT') {
    const sids = studentIdsOf(req);
    const ok = sids.length && a.status !== 'draft' && getDb().prepare(`SELECT 1 FROM enrollments WHERE class_arm_id = ? AND student_id IN (${sids.map(() => '?').join(',')})`).get(a.class_arm_id, ...sids);
    if (!ok) throw notFound('Assignment not found');
  }
  return a;
}

assignmentsRouter.get('/:id', requirePermission('assignments.view'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const a = loadAssignment(req, id);
  const db = getDb();
  if (req.ctx!.role === 'STUDENT') {
    const sid = studentIdsOf(req)[0];
    return res.json({ ...a, mySubmission: db.prepare('SELECT s.*, f.original_name AS file_name FROM assignment_submissions s LEFT JOIN files f ON f.id = s.file_id WHERE assignment_id = ? AND student_id = ?').get(id, sid) ?? null });
  }
  const submissions = db.prepare(`SELECT st.id AS student_id, st.first_name, st.last_name, st.admission_no, s.id AS submission_id, s.body, s.file_id, f.original_name AS file_name, s.submitted_at, s.score, s.feedback, s.status
    FROM enrollments e JOIN students st ON st.id = e.student_id LEFT JOIN assignment_submissions s ON s.assignment_id = ? AND s.student_id = st.id LEFT JOIN files f ON f.id = s.file_id
    WHERE e.class_arm_id = ? AND e.session_id = (SELECT session_id FROM class_arms WHERE id = ?) AND st.status='active' ORDER BY st.last_name`).all(id, a.class_arm_id, a.class_arm_id);
  res.json({ ...a, submissions });
}));

assignmentsRouter.post('/:id/publish', requirePermission('assignments.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string); const a = loadAssignment(req, id);
  const { status } = parse(z.object({ status: z.enum(['published', 'closed', 'draft']) }), req.body);
  getDb().prepare('UPDATE assignments SET status = ? WHERE id = ?').run(status, id);
  if (status === 'published' && a.status === 'draft') emit({ type: 'ASSIGNMENT_POSTED', schoolId: req.schoolId, assignmentId: id, classArmId: a.class_arm_id, title: a.title });
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'ASSIGNMENT_STATUS_CHANGED', entityType: 'assignment', entityId: id, metadata: { status } });
  res.json({ ok: true });
}));

assignmentsRouter.post('/:id/submit', requirePermission('assignments.submit'), upload.single('file'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string); const a = loadAssignment(req, id);
  if (a.status !== 'published') throw conflict('This assignment is not accepting submissions');
  const sid = studentIdsOf(req)[0];
  const existing = getDb().prepare('SELECT status FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?').get(id, sid) as any;
  if (existing?.status === 'graded') throw conflict('This submission has already been graded');
  const { body } = parse(z.object({ body: z.string().trim().max(10000).optional() }), req.body);
  const fileId = await storeUpload(req, 'submissions');
  if (!body && !fileId) throw conflict('Write a response or attach a file');
  getDb().prepare(`INSERT INTO assignment_submissions (school_id, assignment_id, student_id, body, file_id) VALUES (?,?,?,?,?)
    ON CONFLICT(assignment_id, student_id) DO UPDATE SET body = excluded.body, file_id = COALESCE(excluded.file_id, assignment_submissions.file_id), submitted_at = datetime('now'), status='submitted'`)
    .run(req.schoolId, id, sid, body ?? null, fileId);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'ASSIGNMENT_SUBMITTED', entityType: 'assignment', entityId: id });
  res.status(201).json({ ok: true });
}));

assignmentsRouter.post('/:id/grade', requirePermission('assignments.grade'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string); const a = loadAssignment(req, id);
  const { studentId, score, feedback } = parse(z.object({ studentId: z.number().int().positive(), score: z.number().min(0), feedback: z.string().trim().max(2000).optional() }), req.body);
  if (score > a.max_score) throw conflict(`Score cannot exceed ${a.max_score}`);
  getOwned('students', studentId, req.schoolId, 'Student');
  const r = getDb().prepare(`UPDATE assignment_submissions SET score = ?, feedback = ?, graded_at = datetime('now'), status = 'graded' WHERE assignment_id = ? AND student_id = ? AND school_id = ?`).run(score, feedback ?? null, id, studentId, req.schoolId);
  if (!r.changes) throw notFound('No submission from this student yet');
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'SUBMISSION_GRADED', entityType: 'assignment', entityId: id, metadata: { studentId, score } });
  res.json({ ok: true });
}));
