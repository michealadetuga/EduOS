import { Router } from 'express';
import { asyncHandler, idParam } from '../../core/http.js';
import { requireRole, requireTenant } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';
import { notFound } from '../../core/errors.js';
import { resultsService, teacherIdOf } from '../results/results.service.js';
import { studentAttendance } from '../attendance/attendance.routes.js';

export const portalRouter = Router();
portalRouter.use(requireTenant);

// ---------- Teacher ----------
portalRouter.get('/teacher/overview', requireRole('TEACHER'), asyncHandler(async (req, res) => {
  const db = getDb(); const tid = teacherIdOf(req.ctx!);
  if (!tid) throw notFound('Teacher profile not found');
  const session = db.prepare("SELECT id, name FROM academic_sessions WHERE school_id = ? AND status='active'").get(req.schoolId) as any;
  const term = session ? db.prepare('SELECT id, name FROM terms WHERE session_id = ? AND is_current = 1').get(session.id) : null;
  const assignments = db.prepare(`SELECT cs.id, c.id AS class_arm_id, c.level, c.arm, s.id AS subject_id, s.name AS subject_name,
      (SELECT COUNT(*) FROM enrollments e JOIN students st ON st.id = e.student_id WHERE e.class_arm_id = c.id AND st.status='active') AS student_count,
      (SELECT status FROM result_sheets rs WHERE rs.class_arm_id = c.id AND rs.subject_id = s.id AND rs.term_id = ?) AS sheet_status
    FROM class_subjects cs JOIN class_arms c ON c.id = cs.class_arm_id JOIN subjects s ON s.id = cs.subject_id JOIN academic_sessions a ON a.id = c.session_id
    WHERE cs.teacher_id = ? AND cs.school_id = ? AND a.status = 'active' AND c.status='active' ORDER BY c.level, c.arm, s.name`).all(term?.id ?? 0, tid, req.schoolId);
  const classTeacherOf = db.prepare(`SELECT c.id, c.level, c.arm, (SELECT COUNT(*) FROM enrollments e JOIN students st ON st.id = e.student_id WHERE e.class_arm_id = c.id AND st.status='active') AS student_count
    FROM class_arms c JOIN academic_sessions a ON a.id = c.session_id WHERE c.class_teacher_id = ? AND a.status='active' AND c.status='active'`).all(tid);
  const classes = db.prepare(`SELECT DISTINCT c.id, c.level, c.arm FROM class_arms c JOIN academic_sessions a ON a.id = c.session_id
    WHERE a.status='active' AND c.school_id = ? AND (c.class_teacher_id = ? OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_arm_id = c.id AND cs.teacher_id = ?)) ORDER BY c.level, c.arm`).all(req.schoolId, tid, tid);
  const recentAssignments = db.prepare(`SELECT a.id, a.title, a.status, a.due_at, c.level, c.arm, s.name AS subject_name, (SELECT COUNT(*) FROM assignment_submissions x WHERE x.assignment_id = a.id) submissions
    FROM assignments a JOIN class_arms c ON c.id = a.class_arm_id JOIN subjects s ON s.id = a.subject_id WHERE a.teacher_id = ? ORDER BY a.id DESC LIMIT 5`).all(tid);
  const today = new Date().toISOString().slice(0, 10);
  const attendanceToday = db.prepare(`SELECT class_arm_id, COUNT(*) c FROM attendance WHERE school_id = ? AND date = ? GROUP BY class_arm_id`).all(req.schoolId, today);
  res.json({ teacherId: tid, session, term, assignments, classTeacherOf, classes, recentAssignments, attendanceToday });
}));

// ---------- Student ----------
function myStudent(req: any) {
  const s = getDb().prepare('SELECT * FROM students WHERE user_id = ? AND school_id = ?').get(req.ctx.userId, req.schoolId) as any;
  if (!s) throw notFound('Student profile not found');
  return s;
}
function studentContext(schoolId: number, studentId: number) {
  const db = getDb();
  const session = db.prepare("SELECT id, name FROM academic_sessions WHERE school_id = ? AND status='active'").get(schoolId) as any;
  const term = session ? db.prepare('SELECT id, name FROM terms WHERE session_id = ? AND is_current = 1').get(session.id) : null;
  const enrollment = session ? db.prepare('SELECT e.class_arm_id, c.level, c.arm FROM enrollments e JOIN class_arms c ON c.id = e.class_arm_id WHERE e.student_id = ? AND e.session_id = ?').get(studentId, session.id) as any : null;
  const publishedTerms = db.prepare(`SELECT DISTINCT t.id, t.name, a.name AS session_name FROM result_sheets rs JOIN terms t ON t.id = rs.term_id JOIN academic_sessions a ON a.id = t.session_id
    JOIN enrollments e ON e.class_arm_id = rs.class_arm_id AND e.session_id = rs.session_id AND e.student_id = ? WHERE rs.status = 'PUBLISHED' AND rs.school_id = ? ORDER BY a.name DESC, t.sequence DESC`).all(studentId, schoolId);
  return { session, term, enrollment, publishedTerms };
}

portalRouter.get('/student/overview', requireRole('STUDENT'), asyncHandler(async (req, res) => {
  const s = myStudent(req); const db = getDb();
  const ctx = studentContext(req.schoolId, s.id);
  const upcoming = ctx.enrollment ? db.prepare(`SELECT a.id, a.title, a.due_at, s.name AS subject_name, (SELECT status FROM assignment_submissions x WHERE x.assignment_id = a.id AND x.student_id = ?) my_status
    FROM assignments a JOIN subjects s ON s.id = a.subject_id WHERE a.class_arm_id = ? AND a.status = 'published' ORDER BY a.due_at IS NULL, a.due_at LIMIT 6`).all(s.id, ctx.enrollment.class_arm_id) : [];
  const timetableToday = ctx.enrollment ? db.prepare(`SELECT te.start_time, te.end_time, te.label, s.name AS subject_name FROM timetable_entries te LEFT JOIN subjects s ON s.id = te.subject_id WHERE te.class_arm_id = ? AND te.day_of_week = ? ORDER BY te.start_time`).all(ctx.enrollment.class_arm_id, ((new Date().getDay() + 6) % 7) + 1) : [];
  res.json({ student: { id: s.id, name: `${s.first_name} ${s.last_name}`, admissionNo: s.admission_no }, ...ctx, upcoming, timetableToday, attendance: studentAttendance(req.schoolId, s.id) });
}));
portalRouter.get('/student/results/:termId', requireRole('STUDENT'), asyncHandler(async (req, res) => {
  const s = myStudent(req);
  res.json(resultsService.reportCard(req.schoolId, s.id, idParam(req.params.termId as string, 'termId'), true));
}));
portalRouter.get('/student/attendance', requireRole('STUDENT'), asyncHandler(async (req, res) => res.json(studentAttendance(req.schoolId, myStudent(req).id))));

// ---------- Parent ----------
function myChildren(req: any) {
  return getDb().prepare(`SELECT s.id, s.first_name, s.last_name, s.admission_no, s.gender, sp.relationship FROM parents p JOIN student_parents sp ON sp.parent_id = p.id JOIN students s ON s.id = sp.student_id
    WHERE p.user_id = ? AND p.school_id = ? ORDER BY s.first_name`).all(req.ctx.userId, req.schoolId) as any[];
}
function myChild(req: any, id: number) {
  const c = myChildren(req).find((x) => x.id === id);
  if (!c) throw notFound('Student not found'); // never reveal other schools'/families' students
  return c;
}
portalRouter.get('/parent/children', requireRole('PARENT'), asyncHandler(async (req, res) => {
  res.json(myChildren(req).map((c) => ({ ...c, ...studentContext(req.schoolId, c.id), attendance: studentAttendance(req.schoolId, c.id).summary })));
}));
portalRouter.get('/parent/children/:id/results/:termId', requireRole('PARENT'), asyncHandler(async (req, res) => {
  const c = myChild(req, idParam(req.params.id as string));
  res.json(resultsService.reportCard(req.schoolId, c.id, idParam(req.params.termId as string, 'termId'), true));
}));
portalRouter.get('/parent/children/:id/attendance', requireRole('PARENT'), asyncHandler(async (req, res) => {
  const c = myChild(req, idParam(req.params.id as string));
  res.json(studentAttendance(req.schoolId, c.id));
}));
