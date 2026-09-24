import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { conflict } from '../../core/errors.js';
import { assertOwned, deleteOwned, getOwned } from '../../core/tenantRepo.js';
import { teacherIdOf } from '../results/results.service.js';

export const timetableRouter = Router();
timetableRouter.use(requireTenant);

const select = `SELECT te.*, s.name AS subject_name, t.first_name || ' ' || t.last_name AS teacher_name, c.level, c.arm
  FROM timetable_entries te LEFT JOIN subjects s ON s.id = te.subject_id LEFT JOIN teachers t ON t.id = te.teacher_id JOIN class_arms c ON c.id = te.class_arm_id`;

timetableRouter.get('/class/:classArmId', requirePermission('timetable.view'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.classArmId as string, 'classArmId');
  getOwned('class_arms', id, req.schoolId, 'Class');
  const ctx = req.ctx!;
  if (ctx.role === 'STUDENT' || ctx.role === 'PARENT') {
    const ok = getDb().prepare(`SELECT 1 FROM enrollments e JOIN students st ON st.id = e.student_id LEFT JOIN student_parents sp ON sp.student_id = st.id LEFT JOIN parents p ON p.id = sp.parent_id
      WHERE e.class_arm_id = ? AND (st.user_id = ? OR p.user_id = ?)`).get(id, ctx.userId, ctx.userId);
    if (!ok) return res.status(404).json({ error: { message: 'Class not found', code: 'NOT_FOUND' } });
  }
  res.json(getDb().prepare(`${select} WHERE te.class_arm_id = ? AND te.school_id = ? ORDER BY te.day_of_week, te.start_time`).all(id, req.schoolId));
}));

timetableRouter.get('/mine', requirePermission('timetable.view'), asyncHandler(async (req, res) => {
  const tid = teacherIdOf(req.ctx!);
  if (!tid) return res.json([]);
  res.json(getDb().prepare(`${select} WHERE te.teacher_id = ? AND te.school_id = ? ORDER BY te.day_of_week, te.start_time`).all(tid, req.schoolId));
}));

const entrySchema = z.object({
  classArmId: z.number().int().positive(), subjectId: z.number().int().positive().nullable().optional(), teacherId: z.number().int().positive().nullable().optional(),
  dayOfWeek: z.number().int().min(1).max(7), startTime: z.string().regex(/^\d{2}:\d{2}$/), endTime: z.string().regex(/^\d{2}:\d{2}$/), label: z.string().trim().max(40).optional(),
});
timetableRouter.post('/', requirePermission('timetable.manage'), asyncHandler(async (req, res) => {
  const e = parse(entrySchema, req.body);
  if (e.endTime <= e.startTime) throw conflict('End time must be after start time');
  getOwned('class_arms', e.classArmId, req.schoolId, 'Class');
  assertOwned('subjects', e.subjectId, req.schoolId, 'Subject'); assertOwned('teachers', e.teacherId, req.schoolId, 'Teacher');
  const clash = getDb().prepare('SELECT 1 FROM timetable_entries WHERE class_arm_id = ? AND day_of_week = ? AND start_time < ? AND end_time > ?').get(e.classArmId, e.dayOfWeek, e.endTime, e.startTime);
  if (clash) throw conflict('This period overlaps an existing entry for the class');
  if (e.teacherId) {
    const tclash = getDb().prepare('SELECT 1 FROM timetable_entries WHERE teacher_id = ? AND day_of_week = ? AND start_time < ? AND end_time > ?').get(e.teacherId, e.dayOfWeek, e.endTime, e.startTime);
    if (tclash) throw conflict('The teacher already has a period at this time');
  }
  const r = getDb().prepare('INSERT INTO timetable_entries (school_id, class_arm_id, subject_id, teacher_id, day_of_week, start_time, end_time, label) VALUES (?,?,?,?,?,?,?,?)')
    .run(req.schoolId, e.classArmId, e.subjectId ?? null, e.teacherId ?? null, e.dayOfWeek, e.startTime, e.endTime, e.label ?? null);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'TIMETABLE_ENTRY_CREATED', entityType: 'timetable_entry', entityId: Number(r.lastInsertRowid) });
  res.status(201).json({ id: Number(r.lastInsertRowid) });
}));
timetableRouter.delete('/:id', requirePermission('timetable.manage'), asyncHandler(async (req, res) => {
  deleteOwned('timetable_entries', idParam(req.params.id as string), req.schoolId, 'Entry');
  res.json({ ok: true });
}));
