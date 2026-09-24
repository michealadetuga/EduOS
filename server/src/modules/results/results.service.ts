import { getDb, transaction } from '../../db/connection.js';
import { conflict, forbidden, notFound } from '../../core/errors.js';
import { audit } from '../../core/audit.js';
import { emit } from '../../core/events.js';
import { getOwned } from '../../core/tenantRepo.js';
import { computeGrade, DEFAULT_GRADING_SCALE, type GradingScale } from './grading.js';
import type { TenantContext } from '../../core/context.js';

export type SheetStatus = 'DRAFT' | 'SUBMITTED' | 'REVIEW' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';

export function scaleFor(schoolId: number): GradingScale {
  const s = getDb().prepare('SELECT grading_scale FROM schools WHERE id = ?').get(schoolId) as any;
  return s?.grading_scale ? JSON.parse(s.grading_scale) : DEFAULT_GRADING_SCALE;
}

export function teacherIdOf(ctx: TenantContext): number | null {
  if (ctx.role !== 'TEACHER') return null;
  const t = getDb().prepare('SELECT id FROM teachers WHERE user_id = ? AND school_id = ?').get(ctx.userId, ctx.schoolId) as any;
  return t?.id ?? null;
}

/** Teachers may only touch sheets for subject/class combinations assigned to them. */
export function assertTeacherOwnsSheet(ctx: TenantContext, sheet: { class_arm_id: number; subject_id: number; teacher_id: number | null }) {
  if (ctx.role !== 'TEACHER') return;
  const tid = teacherIdOf(ctx);
  const assigned = tid && getDb().prepare('SELECT 1 FROM class_subjects WHERE teacher_id = ? AND class_arm_id = ? AND subject_id = ? AND school_id = ?').get(tid, sheet.class_arm_id, sheet.subject_id, ctx.schoolId);
  if (!assigned && sheet.teacher_id !== tid) throw forbidden('You are not assigned to this class subject');
}

const sheetSelect = `SELECT rs.*, c.level, c.arm, s.name AS subject_name, t.name AS term_name, a.name AS session_name,
    te.first_name || ' ' || te.last_name AS teacher_name,
    (SELECT COUNT(*) FROM results r WHERE r.sheet_id = rs.id AND r.total IS NOT NULL) AS scored_count,
    (SELECT COUNT(*) FROM enrollments e JOIN students st ON st.id = e.student_id WHERE e.class_arm_id = rs.class_arm_id AND e.session_id = rs.session_id AND st.status='active') AS student_count
  FROM result_sheets rs JOIN class_arms c ON c.id = rs.class_arm_id JOIN subjects s ON s.id = rs.subject_id
  JOIN terms t ON t.id = rs.term_id JOIN academic_sessions a ON a.id = rs.session_id LEFT JOIN teachers te ON te.id = rs.teacher_id`;

export const resultsService = {
  listSheets(schoolId: number, f: { sessionId?: number; termId?: number; classArmId?: number; subjectId?: number; status?: string; teacherId?: number | null }) {
    const params: unknown[] = [schoolId];
    let where = 'WHERE rs.school_id = ?';
    if (f.sessionId) { where += ' AND rs.session_id = ?'; params.push(f.sessionId); }
    if (f.termId) { where += ' AND rs.term_id = ?'; params.push(f.termId); }
    if (f.classArmId) { where += ' AND rs.class_arm_id = ?'; params.push(f.classArmId); }
    if (f.subjectId) { where += ' AND rs.subject_id = ?'; params.push(f.subjectId); }
    if (f.status) { where += ' AND rs.status = ?'; params.push(f.status); }
    if (f.teacherId) { where += ' AND (rs.teacher_id = ? OR EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.teacher_id = ? AND cs.class_arm_id = rs.class_arm_id AND cs.subject_id = rs.subject_id))'; params.push(f.teacherId, f.teacherId); }
    return getDb().prepare(`${sheetSelect} ${where} ORDER BY rs.updated_at DESC`).all(...(params as any[]));
  },

  /** Get or create the sheet for (term, class, subject). Idempotent. */
  openSheet(ctx: TenantContext, termId: number, classArmId: number, subjectId: number) {
    const schoolId = ctx.schoolId!;
    const term = getOwned<any>('terms', termId, schoolId, 'Term');
    const cls = getOwned<any>('class_arms', classArmId, schoolId, 'Class');
    getOwned('subjects', subjectId, schoolId, 'Subject');
    if (cls.session_id !== term.session_id) throw conflict('Class and term belong to different sessions');
    const cs = getDb().prepare('SELECT teacher_id FROM class_subjects WHERE class_arm_id = ? AND subject_id = ?').get(classArmId, subjectId) as any;
    if (!cs) throw conflict('This subject is not assigned to this class');
    assertTeacherOwnsSheet(ctx, { class_arm_id: classArmId, subject_id: subjectId, teacher_id: cs.teacher_id });
    let sheet = getDb().prepare('SELECT * FROM result_sheets WHERE term_id = ? AND class_arm_id = ? AND subject_id = ?').get(termId, classArmId, subjectId) as any;
    if (!sheet) {
      const r = getDb().prepare('INSERT INTO result_sheets (school_id, session_id, term_id, class_arm_id, subject_id, teacher_id) VALUES (?,?,?,?,?,?)')
        .run(schoolId, term.session_id, termId, classArmId, subjectId, cs.teacher_id ?? teacherIdOf(ctx));
      sheet = { id: Number(r.lastInsertRowid) };
    }
    return this.getSheet(ctx, sheet.id);
  },

  getSheet(ctx: TenantContext, id: number) {
    const schoolId = ctx.schoolId!;
    const sheet = getDb().prepare(`${sheetSelect} WHERE rs.id = ? AND rs.school_id = ?`).get(id, schoolId) as any;
    if (!sheet) throw notFound('Result sheet not found');
    assertTeacherOwnsSheet(ctx, sheet);
    const rows = getDb().prepare(`SELECT st.id AS student_id, st.admission_no, st.first_name, st.last_name, r.ca1, r.ca2, r.exam, r.total, r.grade, r.remark, r.teacher_comment
      FROM enrollments e JOIN students st ON st.id = e.student_id
      LEFT JOIN results r ON r.sheet_id = ? AND r.student_id = st.id
      WHERE e.class_arm_id = ? AND e.session_id = ? AND st.status = 'active' ORDER BY st.last_name, st.first_name`).all(id, sheet.class_arm_id, sheet.session_id);
    return { ...sheet, scale: scaleFor(schoolId), rows };
  },

  saveScores(ctx: TenantContext, id: number, entries: { studentId: number; ca1?: number | null; ca2?: number | null; exam?: number | null; teacherComment?: string | null }[]) {
    const sheet = this.getSheet(ctx, id);
    if (!['DRAFT', 'REJECTED'].includes(sheet.status)) throw conflict(`Scores cannot be edited while the sheet is ${sheet.status.toLowerCase()}`);
    const scale = sheet.scale as GradingScale;
    const enrolled = new Set(sheet.rows.map((r: any) => r.student_id));
    transaction(() => {
      const db = getDb();
      for (const e of entries) {
        if (!enrolled.has(e.studentId)) throw conflict(`Student ${e.studentId} is not enrolled in this class`);
        if ((e.ca1 ?? 0) > scale.ca1Max || (e.ca2 ?? 0) > scale.ca2Max || (e.exam ?? 0) > scale.examMax) throw conflict(`Score exceeds maximum (CA1 ${scale.ca1Max}, CA2 ${scale.ca2Max}, Exam ${scale.examMax})`);
        const complete = e.ca1 != null && e.ca2 != null && e.exam != null;
        const total = complete ? Number(e.ca1) + Number(e.ca2) + Number(e.exam) : null;
        const g = total !== null ? computeGrade(total, scale) : { grade: null, remark: null };
        db.prepare(`INSERT INTO results (school_id, sheet_id, student_id, ca1, ca2, exam, total, grade, remark, teacher_comment, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
          ON CONFLICT(sheet_id, student_id) DO UPDATE SET ca1=excluded.ca1, ca2=excluded.ca2, exam=excluded.exam, total=excluded.total, grade=excluded.grade, remark=excluded.remark, teacher_comment=excluded.teacher_comment, updated_at=datetime('now')`)
          .run(ctx.schoolId, id, e.studentId, e.ca1 ?? null, e.ca2 ?? null, e.exam ?? null, total, g.grade, g.remark, e.teacherComment ?? null);
      }
      db.prepare("UPDATE result_sheets SET updated_at = datetime('now') WHERE id = ?").run(id);
    });
    audit({ schoolId: ctx.schoolId, actorId: ctx.userId, action: 'RESULTS_SAVED', entityType: 'result_sheet', entityId: id, metadata: { count: entries.length } });
    return this.getSheet(ctx, id);
  },

  transition(ctx: TenantContext, id: number, action: 'submit' | 'approve' | 'reject' | 'publish' | 'reopen', note?: string) {
    const sheet = this.getSheet(ctx, id);
    const from: SheetStatus = sheet.status;
    const allowed: Record<typeof action, SheetStatus[]> = {
      submit: ['DRAFT', 'REJECTED'], approve: ['SUBMITTED', 'REVIEW'], reject: ['SUBMITTED', 'REVIEW', 'APPROVED'], publish: ['APPROVED'], reopen: ['PUBLISHED'],
    };
    if (!allowed[action].includes(from)) throw conflict(`Cannot ${action} a sheet that is ${from.toLowerCase()}`);
    if (action === 'submit' && sheet.rows.some((r: any) => r.total === null)) throw conflict('Enter complete scores for every student before submitting');
    const next: Record<typeof action, SheetStatus> = { submit: 'SUBMITTED', approve: 'APPROVED', reject: 'REJECTED', publish: 'PUBLISHED', reopen: 'APPROVED' };
    const stamp = action === 'submit' ? ', submitted_at = datetime(\'now\')' : action === 'approve' ? ', approved_at = datetime(\'now\')' : action === 'publish' ? ', published_at = datetime(\'now\')' : '';
    getDb().prepare(`UPDATE result_sheets SET status = ?, review_note = ?, updated_at = datetime('now') ${stamp} WHERE id = ? AND school_id = ?`).run(next[action], note ?? null, id, ctx.schoolId);
    const teacherUserId = sheet.teacher_id ? ((getDb().prepare('SELECT user_id FROM teachers WHERE id = ?').get(sheet.teacher_id) as any)?.user_id ?? null) : null;
    audit({ schoolId: ctx.schoolId, actorId: ctx.userId, action: `RESULT_${next[action] === 'APPROVED' && action === 'reopen' ? 'REOPENED' : next[action]}`, entityType: 'result_sheet', entityId: id, metadata: { from, to: next[action], note } });
    if (action === 'submit') emit({ type: 'RESULT_SUBMITTED', schoolId: ctx.schoolId!, sheetId: id, teacherUserId });
    if (action === 'approve') emit({ type: 'RESULT_APPROVED', schoolId: ctx.schoolId!, sheetId: id, teacherUserId });
    if (action === 'reject') emit({ type: 'RESULT_REJECTED', schoolId: ctx.schoolId!, sheetId: id, teacherUserId, note });
    if (action === 'publish') emit({ type: 'RESULT_PUBLISHED', schoolId: ctx.schoolId!, sheetId: id, classArmId: sheet.class_arm_id });
    return this.getSheet(ctx, id);
  },

  /** Report card. publishedOnly=true for student/parent views: unpublished sheets are invisible. */
  reportCard(schoolId: number, studentId: number, termId: number, publishedOnly: boolean) {
    const db = getDb();
    const student = getOwned<any>('students', studentId, schoolId, 'Student');
    const term = getOwned<any>('terms', termId, schoolId, 'Term');
    const enrollment = db.prepare('SELECT e.*, c.level, c.arm FROM enrollments e JOIN class_arms c ON c.id = e.class_arm_id WHERE e.student_id = ? AND e.session_id = ?').get(studentId, term.session_id) as any;
    if (!enrollment) throw notFound('No enrollment for this session');
    const statusFilter = publishedOnly ? "AND rs.status = 'PUBLISHED'" : '';
    const subjects = db.prepare(`SELECT s.name AS subject, r.ca1, r.ca2, r.exam, r.total, r.grade, r.remark, r.teacher_comment, rs.status,
        (SELECT COUNT(*) + 1 FROM results r2 WHERE r2.sheet_id = rs.id AND r2.total > r.total) AS position,
        (SELECT ROUND(AVG(total),1) FROM results r3 WHERE r3.sheet_id = rs.id) AS class_average
      FROM result_sheets rs JOIN subjects s ON s.id = rs.subject_id
      LEFT JOIN results r ON r.sheet_id = rs.id AND r.student_id = ?
      WHERE rs.term_id = ? AND rs.class_arm_id = ? ${statusFilter} ORDER BY s.name`).all(studentId, termId, enrollment.class_arm_id) as any[];
    const scored = subjects.filter((s) => s.total !== null);
    const totalScore = scored.reduce((a, s) => a + s.total, 0);
    const attendance = db.prepare(`SELECT status, COUNT(*) c FROM attendance WHERE student_id = ? AND term_id = ? GROUP BY status`).all(studentId, termId);
    const comments = db.prepare('SELECT class_teacher_comment, admin_comment FROM report_card_comments WHERE student_id = ? AND term_id = ?').get(studentId, termId) ?? {};
    const school = db.prepare('SELECT name, address, phone, email, logo_key, code FROM schools WHERE id = ?').get(schoolId);
    const session = db.prepare('SELECT name FROM academic_sessions WHERE id = ?').get(term.session_id) as any;
    return {
      school, student: { id: student.id, name: `${student.first_name} ${student.last_name}`, admissionNo: student.admission_no, gender: student.gender },
      class: `${enrollment.level} ${enrollment.arm}`, term: term.name, session: session?.name,
      subjects, totalScore, average: scored.length ? Number((totalScore / scored.length).toFixed(1)) : null, subjectCount: scored.length,
      attendance, comments, scale: scaleFor(schoolId), publishedOnly,
    };
  },
};
