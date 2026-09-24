import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb, transaction } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { conflict, forbidden } from '../../core/errors.js';
import { getOwned } from '../../core/tenantRepo.js';
import { teacherIdOf } from '../results/results.service.js';

export const attendanceRouter = Router();
attendanceRouter.use(requireTenant);

function assertTeacherHasClass(req: any, classArmId: number) {
  if (req.ctx.role !== 'TEACHER') return;
  const tid = teacherIdOf(req.ctx);
  const ok = getDb().prepare('SELECT 1 FROM class_arms c WHERE c.id = ? AND c.school_id = ? AND (c.class_teacher_id = ? OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_arm_id = c.id AND cs.teacher_id = ?))').get(classArmId, req.schoolId, tid, tid);
  if (!ok) throw forbidden('You are not assigned to this class');
}

attendanceRouter.get('/class/:classArmId', requirePermission('attendance.view'), asyncHandler(async (req, res) => {
  const classArmId = idParam(req.params.classArmId as string, 'classArmId');
  const cls = getOwned<any>('class_arms', classArmId, req.schoolId, 'Class');
  assertTeacherHasClass(req, classArmId);
  const date = z.string().date().catch(new Date().toISOString().slice(0, 10)).parse(req.query.date);
  const rows = getDb().prepare(`SELECT st.id AS student_id, st.admission_no, st.first_name, st.last_name, a.status
    FROM enrollments e JOIN students st ON st.id = e.student_id LEFT JOIN attendance a ON a.student_id = st.id AND a.date = ?
    WHERE e.class_arm_id = ? AND e.session_id = ? AND st.status='active' ORDER BY st.last_name, st.first_name`).all(date, classArmId, cls.session_id);
  const summary = getDb().prepare(`SELECT date, SUM(status='present') present, SUM(status='absent') absent, SUM(status='late') late, SUM(status='excused') excused
    FROM attendance WHERE class_arm_id = ? AND school_id = ? GROUP BY date ORDER BY date DESC LIMIT 30`).all(classArmId, req.schoolId);
  res.json({ date, rows, summary, submitted: rows.some((r: any) => r.status) });
}));

const markSchema = z.object({
  classArmId: z.number().int().positive(), date: z.string().date(),
  entries: z.array(z.object({ studentId: z.number().int().positive(), status: z.enum(['present', 'absent', 'late', 'excused']) })).min(1).max(300),
});
attendanceRouter.post('/mark', requirePermission('attendance.mark'), asyncHandler(async (req, res) => {
  const p = parse(markSchema, req.body);
  const cls = getOwned<any>('class_arms', p.classArmId, req.schoolId, 'Class');
  assertTeacherHasClass(req, p.classArmId);
  if (p.date > new Date().toISOString().slice(0, 10)) throw conflict('Cannot mark attendance for a future date');
  const term = getDb().prepare('SELECT id FROM terms WHERE session_id = ? AND is_current = 1').get(cls.session_id) as any;
  const enrolled = new Set((getDb().prepare("SELECT student_id FROM enrollments e JOIN students s ON s.id = e.student_id WHERE class_arm_id = ? AND session_id = ? AND s.status='active'").all(p.classArmId, cls.session_id) as any[]).map((r) => r.student_id));
  transaction(() => {
    const stmt = getDb().prepare(`INSERT INTO attendance (school_id, class_arm_id, term_id, student_id, date, status, marked_by) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by`);
    for (const e of p.entries) {
      if (!enrolled.has(e.studentId)) throw conflict(`Student ${e.studentId} is not in this class`);
      stmt.run(req.schoolId, p.classArmId, term?.id ?? null, e.studentId, p.date, e.status, req.ctx!.userId);
    }
  });
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'ATTENDANCE_MARKED', entityType: 'class_arm', entityId: p.classArmId, metadata: { date: p.date, count: p.entries.length } });
  res.json({ ok: true });
}));

attendanceRouter.get('/student/:studentId', requirePermission('attendance.view'), asyncHandler(async (req, res) => {
  const studentId = idParam(req.params.studentId as string, 'studentId');
  getOwned('students', studentId, req.schoolId, 'Student');
  res.json(studentAttendance(req.schoolId, studentId));
}));

export function studentAttendance(schoolId: number, studentId: number) {
  const db = getDb();
  return {
    summary: db.prepare('SELECT status, COUNT(*) c FROM attendance WHERE student_id = ? AND school_id = ? GROUP BY status').all(studentId, schoolId),
    recent: db.prepare('SELECT date, status FROM attendance WHERE student_id = ? AND school_id = ? ORDER BY date DESC LIMIT 60').all(studentId, schoolId),
  };
}
