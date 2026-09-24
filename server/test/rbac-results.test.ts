import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { seedSchool, startServer, stopServer } from './helpers.js';

let S: Awaited<ReturnType<typeof seedSchool>>;
before(async () => { await startServer(); S = await seedSchool('Workflow School'); });
after(stopServer);

test('role permissions are enforced server-side', async () => {
  assert.equal((await S.teacher.post('/api/students', { firstName: 'A', lastName: 'B' })).status, 403);
  assert.equal((await S.teacher.post('/api/teachers', { firstName: 'A', lastName: 'B', email: 'x@y.test' })).status, 403);
  assert.equal((await S.teacher.get('/api/audit')).status, 403);
  assert.equal((await S.student.get('/api/students')).status, 403);
  assert.equal((await S.student.get('/api/results/sheets')).status, 403);
  assert.equal((await S.parent.get('/api/teachers')).status, 403);
  assert.equal((await S.admin.get('/api/platform/dashboard')).status, 403, 'school admin is not super admin');
  assert.equal((await S.teacher.get('/api/platform/schools')).status, 403);
  // Parent cannot link children to themselves
  assert.equal((await S.parent.post(`/api/students/${S.studentId}/parents`, { parentId: S.parentId })).status, 403);
});

test('results workflow: teacher enters → submits; admin approves → publishes; student/parent see only published', async () => {
  const t = S.teacher;
  const open = await t.post('/api/results/sheets/open', { termId: S.termId, classArmId: S.classId, subjectId: S.subjectId });
  assert.equal(open.status, 200); assert.equal(open.body.status, 'DRAFT');
  const sheetId = open.body.id;

  // Student sees nothing yet
  const before = await S.student.get(`/api/portal/student/results/${S.termId}`);
  assert.equal(before.status, 200); assert.equal(before.body.subjects.length, 0);

  // Score above max rejected
  assert.equal((await t.put(`/api/results/sheets/${sheetId}/scores`, { entries: [{ studentId: S.studentId, ca1: 50, ca2: 10, exam: 10 }] })).status, 409);
  // Cannot submit incomplete
  assert.equal((await t.post(`/api/results/sheets/${sheetId}/submit`)).status, 409);

  const saved = await t.put(`/api/results/sheets/${sheetId}/scores`, { entries: [{ studentId: S.studentId, ca1: 18, ca2: 17, exam: 45, teacherComment: 'Good work' }] });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.rows[0].total, 80); assert.equal(saved.body.rows[0].grade, 'A1');

  // Teacher cannot approve/publish
  assert.equal((await t.post(`/api/results/sheets/${sheetId}/approve`)).status, 403);
  assert.equal((await t.post(`/api/results/sheets/${sheetId}/publish`)).status, 403);

  assert.equal((await t.post(`/api/results/sheets/${sheetId}/submit`)).body.status, 'SUBMITTED');
  // Locked after submit
  assert.equal((await t.put(`/api/results/sheets/${sheetId}/scores`, { entries: [{ studentId: S.studentId, ca1: 1, ca2: 1, exam: 1 }] })).status, 409);

  // Admin rejects, teacher fixes, resubmits
  const rej = await S.admin.post(`/api/results/sheets/${sheetId}/reject`, { note: 'Check CA2' });
  assert.equal(rej.body.status, 'REJECTED');
  assert.equal((await t.put(`/api/results/sheets/${sheetId}/scores`, { entries: [{ studentId: S.studentId, ca1: 18, ca2: 18, exam: 45 }] })).status, 200);
  assert.equal((await t.post(`/api/results/sheets/${sheetId}/submit`)).body.status, 'SUBMITTED');

  // Cannot publish before approval
  assert.equal((await S.admin.post(`/api/results/sheets/${sheetId}/publish`)).status, 409);
  assert.equal((await S.admin.post(`/api/results/sheets/${sheetId}/approve`)).body.status, 'APPROVED');

  // Still hidden from student/parent until published
  assert.equal((await S.student.get(`/api/portal/student/results/${S.termId}`)).body.subjects.length, 0);
  assert.equal((await S.admin.post(`/api/results/sheets/${sheetId}/publish`)).body.status, 'PUBLISHED');

  const rc = await S.student.get(`/api/portal/student/results/${S.termId}`);
  assert.equal(rc.body.subjects.length, 1); assert.equal(rc.body.subjects[0].total, 81); assert.equal(rc.body.average, 81);
  const prc = await S.parent.get(`/api/portal/parent/children/${S.studentId}/results/${S.termId}`);
  assert.equal(prc.status, 200); assert.equal(prc.body.subjects[0].grade, 'A1');

  // Notifications reached the student
  const notes = await S.student.get('/api/notifications');
  assert.ok(notes.body.items.some((n: any) => n.event === 'RESULT_PUBLISHED'));
  // Audit trail exists
  const audit = await S.admin.get('/api/audit?action=RESULT_');
  assert.ok(audit.body.items.some((a: any) => a.action === 'RESULT_PUBLISHED'));
});

test('attendance: duplicate-safe, visible to student and parent', async () => {
  const mark = await S.teacher.post('/api/attendance/mark', { classArmId: S.classId, date: '2026-09-14', entries: [{ studentId: S.studentId, status: 'absent' }] });
  assert.equal(mark.status, 200);
  const again = await S.teacher.post('/api/attendance/mark', { classArmId: S.classId, date: '2026-09-14', entries: [{ studentId: S.studentId, status: 'present' }] });
  assert.equal(again.status, 200);
  const st = await S.student.get('/api/portal/student/attendance');
  assert.equal(st.body.recent.length, 1); assert.equal(st.body.recent[0].status, 'present');
  const pa = await S.parent.get(`/api/portal/parent/children/${S.studentId}/attendance`);
  assert.equal(pa.body.recent.length, 1);
  assert.equal((await S.teacher.post('/api/attendance/mark', { classArmId: S.classId, date: '2999-01-01', entries: [{ studentId: S.studentId, status: 'present' }] })).status, 409);
});

test('CSV import: preview reports errors, import is atomic', async () => {
  const bad = 'first_name,last_name,gender,class\nAda,Lovelace,female,SS1 A\n,Missing,male,SS1 A\nBob,Wrong,other,SS9 Z';
  const pv = await S.admin.post('/api/students/import/preview', { csv: bad });
  assert.equal(pv.status, 200); assert.ok(pv.body.errors.length >= 3);
  const before = (await S.admin.get('/api/students')).body.total;
  assert.equal((await S.admin.post('/api/students/import', { csv: bad })).status, 422);
  assert.equal((await S.admin.get('/api/students')).body.total, before, 'nothing imported');
  const good = 'first_name,last_name,gender,class\nAda,Lovelace,female,SS1 A\nGrace,Hopper,female,SS1A';
  const imp = await S.admin.post('/api/students/import', { csv: good });
  assert.equal(imp.status, 201); assert.equal(imp.body.created, 2);
  assert.equal((await S.admin.get('/api/students')).body.total, before + 2);
  const cls = await S.admin.get(`/api/classes/${S.classId}`);
  assert.equal(cls.body.students.length, 3);
});

test('assignments: teacher creates+publishes, student submits, teacher grades; drafts hidden', async () => {
  const draft = await S.teacher.req('POST', '/api/assignments', { classArmId: S.classId, subjectId: S.subjectId, title: 'Draft HW', maxScore: 10, publish: false });
  assert.equal(draft.status, 201);
  assert.equal((await S.student.get(`/api/assignments/${draft.body.id}`)).status, 404, 'draft invisible');
  const pub = await S.teacher.req('POST', '/api/assignments', { classArmId: S.classId, subjectId: S.subjectId, title: 'Algebra HW', maxScore: 10, publish: true });
  const list = await S.student.get('/api/assignments');
  assert.equal(list.body.length, 1);
  assert.equal((await S.student.post(`/api/assignments/${pub.body.id}/submit`, { body: 'x = 4' })).status, 201);
  assert.equal((await S.teacher.post(`/api/assignments/${pub.body.id}/grade`, { studentId: S.studentId, score: 11 })).status, 409);
  assert.equal((await S.teacher.post(`/api/assignments/${pub.body.id}/grade`, { studentId: S.studentId, score: 9, feedback: 'Nice' })).status, 200);
  const mine = await S.student.get(`/api/assignments/${pub.body.id}`);
  assert.equal(mine.body.mySubmission.score, 9);
  assert.equal((await S.student.post(`/api/assignments/${pub.body.id}/grade`, { studentId: S.studentId, score: 10 })).status, 403);
});

test('announcements respect audience; onboarding reflects real data', async () => {
  await S.admin.post('/api/announcements', { title: 'Staff meeting', content: 'Friday 2pm', audience: 'teachers' });
  await S.admin.post('/api/announcements', { title: 'Resumption', content: 'Monday', audience: 'all' });
  assert.equal((await S.teacher.get('/api/announcements')).body.length, 2);
  assert.equal((await S.student.get('/api/announcements')).body.length, 1);
  assert.equal((await S.parent.get('/api/announcements')).body.length, 1);
  const ob = await S.admin.get('/api/schools/me/onboarding');
  assert.ok(ob.body.steps.find((s: any) => s.key === 'classes').done);
  assert.ok(ob.body.requiredDone);
  const dash = await S.admin.get('/api/schools/me/dashboard');
  assert.equal(dash.body.totals.teachers, 1); assert.ok(dash.body.totals.students >= 1);
});

test('teacher portal overview lists only assigned classes; student sees own class', async () => {
  const ov = await S.teacher.get('/api/portal/teacher/overview');
  assert.equal(ov.status, 200); assert.equal(ov.body.assignments.length, 1); assert.equal(ov.body.assignments[0].sheet_status, 'PUBLISHED');
  const so = await S.student.get('/api/portal/student/overview');
  assert.equal(so.body.enrollment.level, 'SS1'); assert.equal(so.body.publishedTerms.length, 1);
});
