import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { resultsService, teacherIdOf } from './results.service.js';
import { getDb } from '../../db/connection.js';
import { getOwned } from '../../core/tenantRepo.js';
import { audit } from '../../core/audit.js';

export const resultsRouter = Router();
resultsRouter.use(requireTenant);

const num = (v: unknown) => (v === undefined || v === '' ? undefined : Number(v));

resultsRouter.get('/sheets', requirePermission('results.view'), asyncHandler(async (req, res) => {
  const q = req.query as Record<string, string>;
  res.json(resultsService.listSheets(req.schoolId, {
    sessionId: num(q.sessionId), termId: num(q.termId), classArmId: num(q.classArmId), subjectId: num(q.subjectId), status: q.status || undefined,
    teacherId: req.ctx!.role === 'TEACHER' ? teacherIdOf(req.ctx!) : num(q.teacherId),
  }));
}));

resultsRouter.post('/sheets/open', requirePermission('results.enter', 'results.view'), asyncHandler(async (req, res) => {
  const { termId, classArmId, subjectId } = parse(z.object({ termId: z.number().int().positive(), classArmId: z.number().int().positive(), subjectId: z.number().int().positive() }), req.body);
  res.json(resultsService.openSheet(req.ctx!, termId, classArmId, subjectId));
}));

resultsRouter.get('/sheets/:id', requirePermission('results.view'), asyncHandler(async (req, res) => res.json(resultsService.getSheet(req.ctx!, idParam(req.params.id as string)))));

const scoreSchema = z.object({ entries: z.array(z.object({
  studentId: z.number().int().positive(),
  ca1: z.number().min(0).max(100).nullable().optional(), ca2: z.number().min(0).max(100).nullable().optional(), exam: z.number().min(0).max(100).nullable().optional(),
  teacherComment: z.string().trim().max(200).nullable().optional(),
})).min(1).max(300) });
resultsRouter.put('/sheets/:id/scores', requirePermission('results.enter', 'results.update'), asyncHandler(async (req, res) => {
  const { entries } = parse(scoreSchema, req.body);
  res.json(resultsService.saveScores(req.ctx!, idParam(req.params.id as string), entries));
}));

const noteSchema = z.object({ note: z.string().trim().max(500).optional() });
resultsRouter.post('/sheets/:id/submit', requirePermission('results.submit'), asyncHandler(async (req, res) => res.json(resultsService.transition(req.ctx!, idParam(req.params.id as string), 'submit'))));
resultsRouter.post('/sheets/:id/approve', requirePermission('results.approve'), asyncHandler(async (req, res) => res.json(resultsService.transition(req.ctx!, idParam(req.params.id as string), 'approve', parse(noteSchema, req.body).note))));
resultsRouter.post('/sheets/:id/reject', requirePermission('results.approve'), asyncHandler(async (req, res) => {
  const { note } = parse(noteSchema.required(), req.body);
  res.json(resultsService.transition(req.ctx!, idParam(req.params.id as string), 'reject', note));
}));
resultsRouter.post('/sheets/:id/publish', requirePermission('results.publish'), asyncHandler(async (req, res) => res.json(resultsService.transition(req.ctx!, idParam(req.params.id as string), 'publish'))));
resultsRouter.post('/sheets/:id/reopen', requirePermission('results.publish'), asyncHandler(async (req, res) => res.json(resultsService.transition(req.ctx!, idParam(req.params.id as string), 'reopen', parse(noteSchema, req.body).note))));

/** Admin/teacher report card (includes unpublished sheets, marked by status). */
resultsRouter.get('/report-card/:studentId/:termId', requirePermission('results.view'), asyncHandler(async (req, res) => {
  const studentId = idParam(req.params.studentId as string, 'studentId'); const termId = idParam(req.params.termId as string, 'termId');
  if (req.ctx!.role === 'TEACHER') {
    // Teachers see report cards only for classes they teach or are class teacher of.
    const tid = teacherIdOf(req.ctx!);
    const ok = getDb().prepare(`SELECT 1 FROM enrollments e JOIN class_arms c ON c.id = e.class_arm_id JOIN terms t ON t.session_id = e.session_id
      WHERE e.student_id = ? AND t.id = ? AND e.school_id = ? AND (c.class_teacher_id = ? OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_arm_id = c.id AND cs.teacher_id = ?))`).get(studentId, termId, req.schoolId, tid, tid);
    if (!ok) return res.status(403).json({ error: { message: 'You do not teach this student', code: 'FORBIDDEN' } });
  }
  res.json(resultsService.reportCard(req.schoolId, studentId, termId, false));
}));

resultsRouter.put('/report-card/:studentId/:termId/comments', requirePermission('results.approve', 'results.enter'), asyncHandler(async (req, res) => {
  const studentId = idParam(req.params.studentId as string, 'studentId'); const termId = idParam(req.params.termId as string, 'termId');
  getOwned('students', studentId, req.schoolId, 'Student'); getOwned('terms', termId, req.schoolId, 'Term');
  const body = parse(z.object({ classTeacherComment: z.string().trim().max(400).optional(), adminComment: z.string().trim().max(400).optional() }), req.body);
  const isAdmin = req.ctx!.role === 'SCHOOL_ADMIN';
  const existing = getDb().prepare('SELECT * FROM report_card_comments WHERE student_id = ? AND term_id = ?').get(studentId, termId) as any;
  getDb().prepare(`INSERT INTO report_card_comments (school_id, student_id, term_id, class_teacher_comment, admin_comment) VALUES (?,?,?,?,?)
    ON CONFLICT(student_id, term_id) DO UPDATE SET class_teacher_comment = excluded.class_teacher_comment, admin_comment = excluded.admin_comment`)
    .run(req.schoolId, studentId, termId, body.classTeacherComment ?? existing?.class_teacher_comment ?? null, isAdmin ? (body.adminComment ?? existing?.admin_comment ?? null) : existing?.admin_comment ?? null);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'REPORT_COMMENT_SAVED', entityType: 'student', entityId: studentId, metadata: { termId } });
  res.json({ ok: true });
}));
