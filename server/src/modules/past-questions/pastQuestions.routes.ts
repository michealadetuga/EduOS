import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { forbidden } from '../../core/errors.js';

/**
 * Past questions foundation. Content is either platform-provided (school_id NULL, entered under licence)
 * or school-authored. We never scrape or redistribute copyrighted papers; each question carries a source note.
 */
export const pastQuestionsRouter = Router();
pastQuestionsRouter.use(requireTenant);

const visible = 'AND (pq.school_id IS NULL OR pq.school_id = ?)';

pastQuestionsRouter.get('/catalog', requirePermission('past_questions.view'), asyncHandler(async (req, res) => {
  res.json(getDb().prepare(`SELECT exam, subject, year, COUNT(*) count FROM past_questions pq WHERE 1=1 ${visible} GROUP BY exam, subject, year ORDER BY exam, subject, year DESC`).all(req.schoolId));
}));

const qSchema = z.object({
  exam: z.enum(['WAEC', 'NECO', 'BECE', 'JAMB', 'INTERNAL']), year: z.number().int().min(1980).max(2100), subject: z.string().trim().min(2).max(60), topic: z.string().trim().max(80).optional(),
  question: z.string().trim().min(5).max(3000), options: z.array(z.string().trim().min(1).max(500)).min(2).max(6), answer: z.number().int().min(0),
  explanation: z.string().trim().max(3000).optional(), sourceNote: z.string().trim().max(200).optional(),
});
pastQuestionsRouter.post('/', requirePermission('past_questions.manage'), asyncHandler(async (req, res) => {
  const q = parse(qSchema, req.body);
  if (q.answer >= q.options.length) throw forbidden('Answer index out of range');
  const r = getDb().prepare('INSERT INTO past_questions (school_id, exam, year, subject, topic, question, options, answer, explanation, source_note, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(req.schoolId, q.exam, q.year, q.subject, q.topic ?? null, q.question, JSON.stringify(q.options), String(q.answer), q.explanation ?? null, q.sourceNote ?? null, req.ctx!.userId);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'PAST_QUESTION_CREATED', entityType: 'past_question', entityId: Number(r.lastInsertRowid) });
  res.status(201).json({ id: Number(r.lastInsertRowid) });
}));

/** Start a practice set: returns questions without answers. */
pastQuestionsRouter.get('/practice', requirePermission('past_questions.practice', 'past_questions.view'), asyncHandler(async (req, res) => {
  const { exam, subject, year, limit } = parse(z.object({ exam: z.string(), subject: z.string(), year: z.coerce.number().optional(), limit: z.coerce.number().min(1).max(60).default(20) }), req.query);
  const params: unknown[] = [req.schoolId, exam, subject]; let extra = '';
  if (year) { extra = ' AND year = ?'; params.push(year); }
  const rows = getDb().prepare(`SELECT id, exam, year, subject, topic, question, options FROM past_questions pq WHERE 1=1 ${visible} AND exam = ? AND subject = ? ${extra} ORDER BY RANDOM() LIMIT ?`).all(...(params as any[]), limit) as any[];
  res.json(rows.map((r) => ({ ...r, options: JSON.parse(r.options) })));
}));

/** Auto-mark a practice set. */
pastQuestionsRouter.post('/practice/submit', requirePermission('past_questions.practice'), asyncHandler(async (req, res) => {
  const { answers, exam, subject } = parse(z.object({ exam: z.string(), subject: z.string(), answers: z.array(z.object({ id: z.number().int(), choice: z.number().int().min(0) })).min(1).max(60) }), req.body);
  const ids = answers.map((a) => a.id);
  const rows = getDb().prepare(`SELECT id, answer, explanation, options FROM past_questions pq WHERE id IN (${ids.map(() => '?').join(',')}) ${visible}`).all(...ids, req.schoolId) as any[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const review = answers.map((a) => { const q = byId.get(a.id); const correct = q ? Number(q.answer) === a.choice : false; return { id: a.id, choice: a.choice, correct, answer: q ? Number(q.answer) : null, explanation: q?.explanation ?? null }; });
  const correct = review.filter((r) => r.correct).length;
  const student = getDb().prepare('SELECT id FROM students WHERE user_id = ? AND school_id = ?').get(req.ctx!.userId, req.schoolId) as any;
  if (student) getDb().prepare('INSERT INTO practice_attempts (school_id, student_id, exam, subject, total, correct, answers) VALUES (?,?,?,?,?,?,?)').run(req.schoolId, student.id, exam, subject, answers.length, correct, JSON.stringify(answers));
  res.json({ total: answers.length, correct, percent: Math.round((correct / answers.length) * 100), review });
}));

pastQuestionsRouter.get('/attempts', requirePermission('past_questions.practice'), asyncHandler(async (req, res) => {
  res.json(getDb().prepare('SELECT pa.id, pa.exam, pa.subject, pa.total, pa.correct, pa.created_at FROM practice_attempts pa JOIN students s ON s.id = pa.student_id WHERE s.user_id = ? AND pa.school_id = ? ORDER BY pa.id DESC LIMIT 30').all(req.ctx!.userId, req.schoolId));
}));
