import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, pagination, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb, transaction } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { conflict } from '../../core/errors.js';
import { assertOwned, getOwned, paged, updateOwned } from '../../core/tenantRepo.js';
import { authService } from '../auth/auth.service.js';
import { name } from '../auth/auth.schema.js';
import { env } from '../../config/env.js';
import { currentPeriod } from '../academics/academics.routes.js';
import { parseCsv } from './csv.js';
import { LEVELS } from '../classes/classes.routes.js';

export const studentsRouter = Router();
studentsRouter.use(requireTenant);

const studentSchema = z.object({
  firstName: name, lastName: name,
  admissionNo: z.string().trim().min(1).max(30).optional(),
  gender: z.enum(['male', 'female']).optional().nullable(),
  dateOfBirth: z.string().date().optional().nullable(),
  admissionDate: z.string().date().optional().nullable(),
  classArmId: z.number().int().positive().optional().nullable(),
  parentId: z.number().int().positive().optional().nullable(),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  createAccount: z.boolean().default(false),
});

export function nextAdmissionNo(schoolId: number) {
  const db = getDb();
  const school = db.prepare('SELECT code FROM schools WHERE id = ?').get(schoolId) as { code: string };
  const prefix = `${school.code.replace(/^EDU-/, '')}/${String(new Date().getFullYear()).slice(-2)}/`;
  const last = db.prepare('SELECT admission_no FROM students WHERE school_id = ? AND admission_no LIKE ? ORDER BY admission_no DESC LIMIT 1').get(schoolId, `${prefix}%`) as any;
  let seq = last ? Number(last.admission_no.split('/').pop()) + 1 : 1;
  while (db.prepare('SELECT 1 FROM students WHERE school_id = ? AND admission_no = ?').get(schoolId, `${prefix}${String(seq).padStart(4, '0')}`)) seq++;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export function enroll(schoolId: number, studentId: number, classArmId: number, sessionId: number) {
  getDb().prepare(`INSERT INTO enrollments (school_id, student_id, session_id, class_arm_id) VALUES (?,?,?,?)
    ON CONFLICT(student_id, session_id) DO UPDATE SET class_arm_id = excluded.class_arm_id`).run(schoolId, studentId, sessionId, classArmId);
}

const baseSelect = `SELECT st.*, c.id AS class_arm_id, c.level, c.arm, u.status AS account_status, u.email AS account_email,
    (SELECT GROUP_CONCAT(p.first_name || ' ' || p.last_name, ', ') FROM student_parents sp JOIN parents p ON p.id = sp.parent_id WHERE sp.student_id = st.id) AS parent_names
  FROM students st
  LEFT JOIN enrollments e ON e.student_id = st.id AND e.session_id = (SELECT id FROM academic_sessions WHERE school_id = st.school_id AND status = 'active')
  LEFT JOIN class_arms c ON c.id = e.class_arm_id
  LEFT JOIN users u ON u.id = st.user_id`;

studentsRouter.get('/', requirePermission('students.view'), asyncHandler(async (req, res) => {
  const { page, pageSize } = pagination(req.query as any);
  const params: unknown[] = [req.schoolId];
  let where = 'WHERE st.school_id = ?';
  if (req.query.q) { where += " AND (st.first_name || ' ' || st.last_name LIKE ? OR st.admission_no LIKE ?)"; params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  if (req.query.classId) { where += ' AND c.id = ?'; params.push(Number(req.query.classId)); }
  if (req.query.level) { where += ' AND c.level = ?'; params.push(String(req.query.level)); }
  if (req.query.gender) { where += ' AND st.gender = ?'; params.push(String(req.query.gender)); }
  if (req.query.status) { where += ' AND st.status = ?'; params.push(String(req.query.status)); }
  if (req.query.unassigned === '1') where += ' AND c.id IS NULL';
  const sql = `${baseSelect} ${where} ORDER BY st.last_name, st.first_name`;
  const countSql = `SELECT COUNT(*) c FROM (${baseSelect} ${where})`;
  res.json(paged(sql, countSql, params, page, pageSize));
}));

studentsRouter.post('/', requirePermission('students.create'), asyncHandler(async (req, res) => {
  const s = parse(studentSchema, req.body);
  assertOwned('class_arms', s.classArmId, req.schoolId, 'Class');
  assertOwned('parents', s.parentId, req.schoolId, 'Parent');
  const db = getDb();
  const admissionNo = s.admissionNo ?? nextAdmissionNo(req.schoolId);
  if (db.prepare('SELECT 1 FROM students WHERE school_id = ? AND admission_no = ?').get(req.schoolId, admissionNo)) throw conflict(`Admission number ${admissionNo} already exists`);
  let userId: number | null = null; let inviteUrl: string | undefined;
  if (s.createAccount && s.email) {
    const out = await authService.provisionUser({ schoolId: req.schoolId, role: 'STUDENT', firstName: s.firstName, lastName: s.lastName, email: s.email, baseUrl: env.APP_URL || `${req.protocol}://${req.get('host')}`, actorId: req.ctx!.userId });
    userId = out.userId; inviteUrl = out.inviteUrl;
  }
  const id = transaction(() => {
    const r = db.prepare('INSERT INTO students (school_id, user_id, admission_no, first_name, last_name, gender, date_of_birth, admission_date) VALUES (?,?,?,?,?,?,?,?)')
      .run(req.schoolId, userId, admissionNo, s.firstName, s.lastName, s.gender ?? null, s.dateOfBirth ?? null, s.admissionDate ?? new Date().toISOString().slice(0, 10));
    const id = Number(r.lastInsertRowid);
    if (s.classArmId) { const cls = getOwned<any>('class_arms', s.classArmId, req.schoolId); enroll(req.schoolId, id, s.classArmId, cls.session_id); }
    if (s.parentId) db.prepare('INSERT OR IGNORE INTO student_parents (student_id, parent_id, school_id) VALUES (?,?,?)').run(id, s.parentId, req.schoolId);
    audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'STUDENT_CREATED', entityType: 'student', entityId: id, metadata: { admissionNo }, ip: req.ip });
    return id;
  });
  res.status(201).json({ id, admissionNo, inviteUrl });
}));

// ---------- CSV import ----------
const CSV_HEADERS = ['first_name', 'last_name', 'gender', 'admission_no', 'date_of_birth', 'class', 'parent_email'];
studentsRouter.post('/import/preview', requirePermission('students.import'), asyncHandler(async (req, res) => {
  const { csv } = parse(z.object({ csv: z.string().min(1).max(2_000_000) }), req.body);
  res.json(validateImport(req.schoolId, csv));
}));
studentsRouter.post('/import', requirePermission('students.import'), asyncHandler(async (req, res) => {
  const { csv } = parse(z.object({ csv: z.string().min(1).max(2_000_000) }), req.body);
  const v = validateImport(req.schoolId, csv);
  if (v.errors.length) return res.status(422).json({ error: { message: 'Fix the errors before importing', code: 'VALIDATION_ERROR', details: v } });
  const db = getDb();
  const { session } = currentPeriod(req.schoolId);
  const created = transaction(() => {
    let n = 0;
    for (const row of v.rows) {
      const admissionNo = row.admission_no || nextAdmissionNo(req.schoolId);
      const r = db.prepare('INSERT INTO students (school_id, admission_no, first_name, last_name, gender, date_of_birth, admission_date) VALUES (?,?,?,?,?,?,date(\'now\'))')
        .run(req.schoolId, admissionNo, row.first_name, row.last_name, row.gender || null, row.date_of_birth || null);
      const id = Number(r.lastInsertRowid);
      if (row.classArmId) enroll(req.schoolId, id, row.classArmId, session.id);
      if (row.parentId) db.prepare('INSERT OR IGNORE INTO student_parents (student_id, parent_id, school_id) VALUES (?,?,?)').run(id, row.parentId, req.schoolId);
      n++;
    }
    audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'STUDENTS_IMPORTED', entityType: 'student', metadata: { count: n }, ip: req.ip });
    return n;
  });
  res.status(201).json({ created });
}));

function validateImport(schoolId: number, csv: string) {
  const db = getDb();
  const { headers, records } = parseCsv(csv);
  const errors: { row: number; field?: string; message: string }[] = [];
  const missing = ['first_name', 'last_name'].filter((h) => !headers.includes(h));
  if (missing.length) return { headers, rows: [], errors: [{ row: 0, message: `Missing required columns: ${missing.join(', ')}` }], expectedHeaders: CSV_HEADERS, total: records.length };
  const unknown = headers.filter((h) => !CSV_HEADERS.includes(h));
  if (unknown.length) errors.push({ row: 0, message: `Unknown columns ignored: ${unknown.join(', ')}` });
  const activeSession = db.prepare("SELECT id FROM academic_sessions WHERE school_id = ? AND status = 'active'").get(schoolId) as any;
  const classes = activeSession ? (db.prepare('SELECT id, level, arm FROM class_arms WHERE school_id = ? AND session_id = ?').all(schoolId, activeSession.id) as any[]) : [];
  const seen = new Set<string>();
  const rows = records.map((rec, i) => {
    const rowNo = i + 2;
    const row: any = { first_name: rec.first_name?.trim(), last_name: rec.last_name?.trim(), gender: rec.gender?.trim().toLowerCase() || null, admission_no: rec.admission_no?.trim() || null, date_of_birth: rec.date_of_birth?.trim() || null, class: rec.class?.trim() || null, parent_email: rec.parent_email?.trim().toLowerCase() || null };
    if (!row.first_name) errors.push({ row: rowNo, field: 'first_name', message: 'First name is required' });
    if (!row.last_name) errors.push({ row: rowNo, field: 'last_name', message: 'Last name is required' });
    if (row.gender && !['male', 'female'].includes(row.gender)) errors.push({ row: rowNo, field: 'gender', message: 'Gender must be male or female' });
    if (row.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth)) errors.push({ row: rowNo, field: 'date_of_birth', message: 'Use YYYY-MM-DD' });
    if (row.admission_no) {
      if (seen.has(row.admission_no)) errors.push({ row: rowNo, field: 'admission_no', message: 'Duplicate admission number in file' });
      seen.add(row.admission_no);
      if (db.prepare('SELECT 1 FROM students WHERE school_id = ? AND admission_no = ?').get(schoolId, row.admission_no)) errors.push({ row: rowNo, field: 'admission_no', message: 'Admission number already exists' });
    }
    if (row.class) {
      const m = row.class.toUpperCase().replace(/\s+/g, ' ').match(/^(JSS\s?[1-3]|SS\s?[1-3])\s*(.*)$/);
      const level = m?.[1].replace(/\s/, ''); const arm = (m?.[2] || 'A').trim();
      const cls = classes.find((c) => c.level === level && c.arm.toUpperCase() === arm.toUpperCase());
      if (!cls) errors.push({ row: rowNo, field: 'class', message: `Class "${row.class}" not found in the active session` });
      else row.classArmId = cls.id;
    }
    if (row.parent_email) {
      const p = db.prepare('SELECT id FROM parents WHERE school_id = ? AND email = ?').get(schoolId, row.parent_email) as any;
      if (!p) errors.push({ row: rowNo, field: 'parent_email', message: 'No parent with this email; create the parent first' });
      else row.parentId = p.id;
    }
    return row;
  });
  const hardErrors = errors.filter((e) => e.row > 0);
  return { headers, rows, errors: hardErrors, warnings: errors.filter((e) => e.row === 0), expectedHeaders: CSV_HEADERS, total: rows.length, levels: LEVELS };
}

// ---------- promotion ----------
const promoteSchema = z.object({
  fromClassArmId: z.number().int().positive(),
  toSessionId: z.number().int().positive(),
  moves: z.array(z.object({ studentId: z.number().int().positive(), toClassArmId: z.number().int().positive().nullable(), outcome: z.enum(['promoted', 'repeated', 'graduated', 'transferred']) })).min(1).max(500),
});
studentsRouter.post('/promote', requirePermission('students.promote'), asyncHandler(async (req, res) => {
  const p = parse(promoteSchema, req.body);
  const from = getOwned<any>('class_arms', p.fromClassArmId, req.schoolId, 'Class');
  assertOwned('academic_sessions', p.toSessionId, req.schoolId, 'Session');
  const db = getDb();
  transaction(() => {
    for (const m of p.moves) {
      const enrolled = db.prepare('SELECT id FROM enrollments WHERE student_id = ? AND class_arm_id = ? AND school_id = ?').get(m.studentId, from.id, req.schoolId);
      if (!enrolled) throw conflict(`Student ${m.studentId} is not in the source class`);
      db.prepare('UPDATE enrollments SET outcome = ? WHERE id = ?').run(m.outcome, (enrolled as any).id);
      if (m.toClassArmId) {
        const to = getOwned<any>('class_arms', m.toClassArmId, req.schoolId, 'Destination class');
        if (to.session_id !== p.toSessionId) throw conflict('Destination class is not in the target session');
        enroll(req.schoolId, m.studentId, to.id, p.toSessionId);
      }
      if (m.outcome === 'graduated') db.prepare("UPDATE students SET status='graduated' WHERE id = ? AND school_id = ?").run(m.studentId, req.schoolId);
    }
    audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'STUDENTS_PROMOTED', entityType: 'class_arm', entityId: from.id, metadata: { count: p.moves.length, toSessionId: p.toSessionId } });
  });
  res.json({ ok: true, count: p.moves.length });
}));

studentsRouter.get('/:id', requirePermission('students.view'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const st = getDb().prepare(`${baseSelect} WHERE st.id = ? AND st.school_id = ?`).get(id, req.schoolId) as any;
  if (!st) return res.status(404).json({ error: { message: 'Student not found', code: 'NOT_FOUND' } });
  res.json({ ...st, ...studentDetails(req.schoolId, id) });
}));

export function studentDetails(schoolId: number, id: number) {
  const db = getDb();
  return {
    enrollments: db.prepare(`SELECT e.*, a.name AS session_name, c.level, c.arm FROM enrollments e JOIN academic_sessions a ON a.id = e.session_id JOIN class_arms c ON c.id = e.class_arm_id WHERE e.student_id = ? AND e.school_id = ? ORDER BY a.name DESC`).all(id, schoolId),
    parents: db.prepare('SELECT p.id, p.first_name, p.last_name, p.email, p.phone, sp.relationship FROM student_parents sp JOIN parents p ON p.id = sp.parent_id WHERE sp.student_id = ? AND sp.school_id = ?').all(id, schoolId),
    attendanceSummary: db.prepare(`SELECT status, COUNT(*) c FROM attendance WHERE student_id = ? AND school_id = ? GROUP BY status`).all(id, schoolId),
  };
}

studentsRouter.patch('/:id', requirePermission('students.update'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const p = parse(studentSchema.partial().extend({ status: z.enum(['active', 'archived', 'graduated']).optional() }), req.body);
  getOwned('students', id, req.schoolId, 'Student');
  assertOwned('class_arms', p.classArmId, req.schoolId, 'Class');
  transaction(() => {
    updateOwned('students', id, req.schoolId, { first_name: p.firstName, last_name: p.lastName, gender: p.gender, date_of_birth: p.dateOfBirth, admission_date: p.admissionDate, status: p.status, admission_no: p.admissionNo }, 'Student');
    if (p.classArmId) { const cls = getOwned<any>('class_arms', p.classArmId, req.schoolId); enroll(req.schoolId, id, p.classArmId, cls.session_id); }
  });
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'STUDENT_UPDATED', entityType: 'student', entityId: id, metadata: p });
  res.json({ ok: true });
}));

studentsRouter.post('/:id/account', requirePermission('students.update'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const st = getOwned<any>('students', id, req.schoolId, 'Student');
  if (st.user_id) throw conflict('This student already has an account');
  const { email } = parse(z.object({ email: z.string().trim().toLowerCase().email() }), req.body);
  const out = await authService.provisionUser({ schoolId: req.schoolId, role: 'STUDENT', firstName: st.first_name, lastName: st.last_name, email, baseUrl: env.APP_URL || `${req.protocol}://${req.get('host')}`, actorId: req.ctx!.userId });
  getDb().prepare('UPDATE students SET user_id = ? WHERE id = ?').run(out.userId, id);
  res.status(201).json({ ok: true, inviteUrl: out.inviteUrl });
}));

studentsRouter.post('/:id/parents', requirePermission('students.update', 'parents.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  getOwned('students', id, req.schoolId, 'Student');
  const { parentId, relationship } = parse(z.object({ parentId: z.number().int().positive(), relationship: z.string().trim().max(30).optional() }), req.body);
  assertOwned('parents', parentId, req.schoolId, 'Parent');
  getDb().prepare('INSERT OR REPLACE INTO student_parents (student_id, parent_id, school_id, relationship) VALUES (?,?,?,?)').run(id, parentId, req.schoolId, relationship ?? null);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'STUDENT_PARENT_LINKED', entityType: 'student', entityId: id, metadata: { parentId } });
  res.status(201).json({ ok: true });
}));
studentsRouter.delete('/:id/parents/:parentId', requirePermission('students.update', 'parents.manage'), asyncHandler(async (req, res) => {
  getDb().prepare('DELETE FROM student_parents WHERE student_id = ? AND parent_id = ? AND school_id = ?').run(idParam(req.params.id as string), idParam(req.params.parentId as string), req.schoolId);
  res.json({ ok: true });
}));

studentsRouter.delete('/:id', requirePermission('students.delete'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const st = getOwned<any>('students', id, req.schoolId, 'Student');
  transaction(() => {
    updateOwned('students', id, req.schoolId, { status: 'archived' });
    if (st.user_id) { getDb().prepare("UPDATE users SET status='inactive' WHERE id = ?").run(st.user_id); getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(st.user_id); }
  });
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'STUDENT_ARCHIVED', entityType: 'student', entityId: id, ip: req.ip });
  res.json({ ok: true });
}));
