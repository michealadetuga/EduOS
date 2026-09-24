import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { seedSchool, startServer, stopServer, type Client } from './helpers.js';
import { getDb } from '../src/db/connection.js';

let A: Awaited<ReturnType<typeof seedSchool>>; let B: Awaited<ReturnType<typeof seedSchool>>;
before(async () => { await startServer(); A = await seedSchool('Alpha College'); B = await seedSchool('Beta High'); });
after(stopServer);

const notVisible = (status: number) => assert.ok([403, 404].includes(status), `expected 403/404 got ${status}`);

test('School A admin cannot read, update or delete School B resources by id', async () => {
  const a = A.admin;
  notVisible((await a.get(`/api/students/${B.studentId}`)).status);
  notVisible((await a.patch(`/api/students/${B.studentId}`, { firstName: 'Hacked' })).status);
  notVisible((await a.del(`/api/students/${B.studentId}`)).status);
  notVisible((await a.get(`/api/teachers/${B.teacherId}`)).status);
  notVisible((await a.patch(`/api/teachers/${B.teacherId}`, { firstName: 'Hacked' })).status);
  notVisible((await a.get(`/api/parents/${B.parentId}`)).status);
  notVisible((await a.get(`/api/classes/${B.classId}`)).status);
  notVisible((await a.patch(`/api/subjects/${B.subjectId}`, { name: 'Hacked' })).status);
  notVisible((await a.post(`/api/academics/sessions/${B.sessionId}/activate`)).status);
  notVisible((await a.get(`/api/attendance/student/${B.studentId}`)).status);
  notVisible((await a.get(`/api/attendance/class/${B.classId}`)).status);
  notVisible((await a.get(`/api/results/report-card/${B.studentId}/${B.termId}`)).status);
  notVisible((await a.get(`/api/timetable/class/${B.classId}`)).status);
  const st = getDb().prepare('SELECT first_name FROM students WHERE id = ?').get(B.studentId) as any;
  assert.equal(st.first_name, 'Sade', 'School B data unchanged');
});

test('client-supplied foreign ids in bodies are rejected (no cross-tenant references)', async () => {
  const a = A.admin;
  // Student in School A assigned to School B class
  notVisible((await a.post('/api/students', { firstName: 'X', lastName: 'Y', classArmId: B.classId })).status);
  // Link School B parent to School A student
  notVisible((await a.post(`/api/students/${A.studentId}/parents`, { parentId: B.parentId })).status);
  // Assign School B subject/teacher to School A class
  notVisible((await a.post(`/api/classes/${A.classId}/subjects`, { subjectId: B.subjectId })).status);
  notVisible((await a.post(`/api/classes/${A.classId}/subjects`, { subjectId: A.subjectId, teacherId: B.teacherId })).status);
  // Open a result sheet using School B term/class
  notVisible((await a.post('/api/results/sheets/open', { termId: B.termId, classArmId: A.classId, subjectId: A.subjectId })).status);
  notVisible((await a.post('/api/results/sheets/open', { termId: A.termId, classArmId: B.classId, subjectId: A.subjectId })).status);
});

test('lists are scoped to the tenant', async () => {
  const students = await A.admin.get('/api/students');
  assert.ok(students.body.items.every((s: any) => s.school_id === A.schoolId));
  assert.equal(students.body.total, 1);
  const classes = await B.admin.get('/api/classes');
  assert.ok(classes.body.every((c: any) => c.school_id === B.schoolId));
  const audit = await A.admin.get('/api/audit');
  assert.ok(audit.body.items.every((r: any) => r.school_id === A.schoolId));
});

test('teacher of School A cannot touch School B result sheets or attendance', async () => {
  const sheetB = await B.teacher.post('/api/results/sheets/open', { termId: B.termId, classArmId: B.classId, subjectId: B.subjectId });
  assert.equal(sheetB.status, 200);
  notVisible((await A.teacher.get(`/api/results/sheets/${sheetB.body.id}`)).status);
  notVisible((await A.teacher.put(`/api/results/sheets/${sheetB.body.id}/scores`, { entries: [{ studentId: B.studentId, ca1: 1, ca2: 1, exam: 1 }] })).status);
  notVisible((await A.teacher.post('/api/attendance/mark', { classArmId: B.classId, date: '2026-09-01', entries: [{ studentId: B.studentId, status: 'present' }] })).status);
});

test('student and parent from School A cannot see School B student data (and vice-versa)', async () => {
  notVisible((await A.parent.get(`/api/portal/parent/children/${B.studentId}/results/${B.termId}`)).status);
  notVisible((await A.parent.get(`/api/portal/parent/children/${B.studentId}/attendance`)).status);
  notVisible((await A.student.get(`/api/portal/student/results/${B.termId}`)).status);
  const children = await A.parent.get('/api/portal/parent/children');
  assert.deepEqual(children.body.map((c: any) => c.id), [A.studentId]);
});

test('files are tenant-scoped', async () => {
  const db = getDb();
  db.prepare("INSERT INTO files (school_id, storage_key, original_name, mime_type, size) VALUES (?,?,?,?,?)").run(B.schoolId, `school/${B.schoolId}/x/f.pdf`, 'f.pdf', 'application/pdf', 10);
  const id = (db.prepare('SELECT MAX(id) id FROM files').get() as any).id;
  notVisible((await A.admin.get(`/api/files/${id}`)).status);
  notVisible((await A.teacher.get(`/api/files/${id}`)).status);
  notVisible((await A.student.get(`/api/files/${id}`)).status);
});

test('suspended school: all sessions die and login is refused', async () => {
  const C = await seedSchool('Gamma School');
  assert.equal((await C.admin.get('/api/schools/me')).status, 200);
  getDb().prepare("UPDATE schools SET status = 'suspended' WHERE id = ?").run(C.schoolId);
  assert.equal((await C.admin.get('/api/schools/me')).status, 403);
  assert.equal((await C.teacher.get('/api/portal/teacher/overview')).status, 403);
  const login = await C.admin.post('/api/auth/login', { email: C.email, password: 'Str0ngPassw0rd!' });
  assert.equal(login.status, 403);
});

test('expired session is rejected', async () => {
  const C = await seedSchool('Delta School');
  getDb().prepare("UPDATE sessions SET expires_at = datetime('now', '-1 hour') WHERE user_id = (SELECT id FROM users WHERE email = ?)").run(C.email);
  assert.equal((await C.admin.get('/api/auth/me')).status, 401);
});

test('invalid ids return 422/404 not 500', async () => {
  for (const p of ['/api/students/abc', '/api/students/-1', '/api/students/999999', '/api/classes/1e9', '/api/teachers/0']) {
    const r = await A.admin.get(p);
    assert.ok([404, 422].includes(r.status), `${p} -> ${r.status}`);
  }
});
