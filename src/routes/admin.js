const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db } = require('../db');
const { send } = require('../mailer');

const router = express.Router();

function requireAdmin(req, res, next) {
  const auth = req.user;
  if (!auth || auth.role !== 'school_admin')
    return res.status(403).json({ error: 'School Admin access required' });
  req.schoolId = auth.school_id;
  next();
}

router.use(requireAdmin);

function bad(res, msg) {
  return res.status(400).json({ error: msg });
}

function getOwned(table, id, schoolId) {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ? AND school_id = ?`).get(id, schoolId);
}

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  if (typeof v !== 'string') return '';
  return v.trim();
}

function patchBuilder(body, fields) {
  const sets = [];
  const vals = [];
  for (const [key, transform] of Object.entries(fields)) {
    if (!(key in body)) continue;
    sets.push(`${key} = ?`);
    vals.push(transform(body[key]));
  }
  return { sets, vals };
}

router.get('/onboarding', (req, res) => {
  const count = (table) =>
    db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE school_id = ?`).get(req.schoolId).c;
  const settings = db.prepare('SELECT * FROM settings WHERE school_id = ?').get(req.schoolId);
  res.json({
    needs_onboarding: !!req.user.needs_onboarding,
    counts: {
      classes: count('class_arms'),
      subjects: count('subjects'),
      teachers: count('teachers'),
      students: count('students'),
    },
    current_session: settings ? settings.current_session : null,
    current_term: settings ? settings.current_term : null,
  });
});

router.post('/onboarding/complete', (req, res) => {
  db.prepare('UPDATE users SET needs_onboarding = 0 WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

router.get('/school', (req, res) => {
  const school = db
    .prepare('SELECT id, code, name, address, phone, type, status FROM schools WHERE id = ?')
    .get(req.schoolId);
  const settings = db.prepare('SELECT * FROM settings WHERE school_id = ?').get(req.schoolId);
  res.json({ ...school, current_session: settings ? settings.current_session : null, current_term: settings ? settings.current_term : null });
});

router.patch('/school', (req, res) => {
  const body = req.body || {};
  const name = str(body.name);
  if (!name) return bad(res, 'School name is required');
  db.prepare('UPDATE schools SET name = ?, address = ?, phone = ?, type = ? WHERE id = ?').run(
    name,
    str(body.address),
    str(body.phone),
    str(body.type),
    req.schoolId
  );
  db.prepare(
    `INSERT INTO settings (school_id, current_session, current_term) VALUES (?, ?, ?)
     ON CONFLICT(school_id) DO UPDATE SET current_session = excluded.current_session, current_term = excluded.current_term`
  ).run(req.schoolId, str(body.current_session), str(body.current_term));
  res.json({ ok: true });
});

router.get('/classes', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, t.first_name || ' ' || t.last_name AS teacher_name,
        (SELECT COUNT(*) FROM students s WHERE s.class_arm_id = c.id) AS student_count
       FROM class_arms c LEFT JOIN teachers t ON t.id = c.teacher_id
       WHERE c.school_id = ? ORDER BY c.class_name, c.arm`
    )
    .all(req.schoolId);
  res.json(rows);
});

router.post('/classes', (req, res) => {
  const body = req.body || {};
  const className = str(body.class_name);
  const arm = str(body.arm) || 'A';
  if (!className) return bad(res, 'Class name is required (e.g. JSS1)');
  if (body.teacher_id && !getOwned('teachers', num(body.teacher_id), req.schoolId))
    return bad(res, 'Selected teacher does not belong to your school');
  try {
    const result = db
      .prepare('INSERT INTO class_arms (school_id, class_name, arm, capacity, teacher_id) VALUES (?, ?, ?, ?, ?)')
      .run(req.schoolId, className, arm, num(body.capacity), num(body.teacher_id));
    res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
  } catch (err) {
    if (String(err.message).includes('UNIQUE'))
      return bad(res, `${className} ${arm} already exists`);
    throw err;
  }
});

router.patch('/classes/:id', (req, res) => {
  if (!getOwned('class_arms', req.params.id, req.schoolId))
    return res.status(404).json({ error: 'Class not found' });
  const body = req.body || {};
  if (body.teacher_id && !getOwned('teachers', num(body.teacher_id), req.schoolId))
    return bad(res, 'Selected teacher does not belong to your school');
  const { sets, vals } = patchBuilder(body, {
    class_name: str,
    arm: str,
    capacity: num,
    teacher_id: num,
  });
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE class_arms SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`).run(
    ...vals,
    req.params.id,
    req.schoolId
  );
  res.json({ ok: true });
});

router.delete('/classes/:id', (req, res) => {
  const info = db.prepare('DELETE FROM class_arms WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId);
  if (!info.changes) return res.status(404).json({ error: 'Class not found' });
  res.json({ ok: true });
});

router.get('/teachers', (req, res) => {
  const rows = db
    .prepare('SELECT id, first_name, last_name, email, phone, status, created_at FROM teachers WHERE school_id = ? ORDER BY last_name')
    .all(req.schoolId);
  res.json(rows);
});

router.post('/teachers', (req, res) => {
  const body = req.body || {};
  const firstName = str(body.first_name);
  const lastName = str(body.last_name);
  const email = str(body.email).toLowerCase();
  if (!firstName || !lastName) return bad(res, 'Teacher full name is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'A valid teacher email is required');

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) return res.status(409).json({ error: 'An account with this email already exists' });

  const tempPassword = crypto.randomBytes(4).toString('hex');
  const hash = bcrypt.hashSync(tempPassword, 10);

  db.exec('BEGIN');
  try {
    const userResult = db
      .prepare(
        `INSERT INTO users (school_id, role, first_name, last_name, email, password_hash, verified, needs_onboarding)
         VALUES (?, 'teacher', ?, ?, ?, ?, 1, 0)`
      )
      .run(req.schoolId, firstName, lastName, email, hash);
    const userId = Number(userResult.lastInsertRowid);
    const result = db
      .prepare('INSERT INTO teachers (school_id, first_name, last_name, email, phone, user_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.schoolId, firstName, lastName, email, str(body.phone), userId);
    db.exec('COMMIT');

    send({
      to: email,
      subject: 'Your EduOS teacher account',
      body: [
        `Hi ${firstName},`,
        '',
        `An account has been created for you at EduOS.`,
        '',
        `Email: ${email}`,
        `Temporary password: ${tempPassword}`,
        '',
        'Please log in and change your password.',
      ].join('\n'),
    });

    res.status(201).json({
      ok: true,
      id: Number(result.lastInsertRowid),
      message: `Account created. Credentials sent to ${email}.`,
    });
  } catch (err) {
    db.exec('ROLLBACK');
    if (String(err.message).includes('UNIQUE'))
      return res.status(409).json({ error: 'This teacher already exists in your school' });
    throw err;
  }
});

router.patch('/teachers/:id', (req, res) => {
  const teacher = getOwned('teachers', req.params.id, req.schoolId);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
  const { sets, vals } = patchBuilder(req.body || {}, {
    first_name: str,
    last_name: str,
    phone: str,
    status: str,
  });
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE teachers SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`).run(
    ...vals,
    req.params.id,
    req.schoolId
  );
  if ((sets.includes('first_name = ?') || sets.includes('last_name = ?')) && teacher.user_id) {
    db.prepare('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?').run(
      str((req.body || {}).first_name) || teacher.first_name,
      str((req.body || {}).last_name) || teacher.last_name,
      teacher.user_id
    );
  }
  res.json({ ok: true });
});

router.delete('/teachers/:id', (req, res) => {
  const teacher = getOwned('teachers', req.params.id, req.schoolId);
  if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM teachers WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId);
    if (teacher.user_id) db.prepare('DELETE FROM users WHERE id = ?').run(teacher.user_id);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
});

router.get('/subjects', (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, t.first_name || ' ' || t.last_name AS teacher_name
       FROM subjects s LEFT JOIN teachers t ON t.id = s.teacher_id
       WHERE s.school_id = ? ORDER BY s.name`
    )
    .all(req.schoolId);
  const links = db
    .prepare(
      `SELECT sc.subject_id, sc.class_arm_id FROM subject_classes sc
       JOIN subjects s ON s.id = sc.subject_id WHERE s.school_id = ?`
    )
    .all(req.schoolId);
  const bySubject = new Map(rows.map((r) => [r.id, []]));
  for (const l of links) bySubject.get(l.subject_id)?.push(l.class_arm_id);
  res.json(rows.map((r) => ({ ...r, class_ids: bySubject.get(r.id) })));
});

function applySubjectClasses(subjectId, classIds, schoolId) {
  db.prepare('DELETE FROM subject_classes WHERE subject_id = ?').run(subjectId);
  const insert = db.prepare('INSERT OR IGNORE INTO subject_classes (subject_id, class_arm_id) VALUES (?, ?)');
  for (const cid of classIds) {
    if (getOwned('class_arms', cid, schoolId)) insert.run(subjectId, cid);
  }
}

router.post('/subjects', (req, res) => {
  const body = req.body || {};
  const name = str(body.name);
  if (!name) return bad(res, 'Subject name is required');
  const track = body.track === 'elective' ? 'elective' : 'core';
  if (body.teacher_id && !getOwned('teachers', num(body.teacher_id), req.schoolId))
    return bad(res, 'Selected teacher does not belong to your school');
  const result = db
    .prepare('INSERT INTO subjects (school_id, name, code, track, teacher_id) VALUES (?, ?, ?, ?, ?)')
    .run(req.schoolId, name, str(body.code), track, num(body.teacher_id));
  const id = Number(result.lastInsertRowid);
  if (Array.isArray(body.class_ids)) applySubjectClasses(id, body.class_ids.map(num).filter(Boolean), req.schoolId);
  res.status(201).json({ ok: true, id });
});

router.patch('/subjects/:id', (req, res) => {
  if (!getOwned('subjects', req.params.id, req.schoolId))
    return res.status(404).json({ error: 'Subject not found' });
  const body = req.body || {};
  if (body.teacher_id && !getOwned('teachers', num(body.teacher_id), req.schoolId))
    return bad(res, 'Selected teacher does not belong to your school');
  const { sets, vals } = patchBuilder(body, { name: str, code: str, track: str, teacher_id: num });
  if (sets.length)
    db.prepare(`UPDATE subjects SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`).run(
      ...vals,
      req.params.id,
      req.schoolId
    );
  if (Array.isArray(body.class_ids))
    applySubjectClasses(Number(req.params.id), body.class_ids.map(num).filter(Boolean), req.schoolId);
  res.json({ ok: true });
});

router.delete('/subjects/:id', (req, res) => {
  const info = db.prepare('DELETE FROM subjects WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId);
  if (!info.changes) return res.status(404).json({ error: 'Subject not found' });
  res.json({ ok: true });
});

router.get('/parents', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, (SELECT GROUP_CONCAT(s.first_name || ' ' || s.last_name, ', ')
        FROM students s WHERE s.parent_id = p.id) AS children
       FROM parents p WHERE p.school_id = ? ORDER BY p.last_name`
    )
    .all(req.schoolId);
  res.json(rows);
});

router.post('/parents', (req, res) => {
  const body = req.body || {};
  const firstName = str(body.first_name);
  const lastName = str(body.last_name);
  if (!firstName || !lastName) return bad(res, 'Parent full name is required');
  const result = db
    .prepare('INSERT INTO parents (school_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?)')
    .run(req.schoolId, firstName, lastName, str(body.email).toLowerCase(), str(body.phone));
  res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
});

router.patch('/parents/:id', (req, res) => {
  if (!getOwned('parents', req.params.id, req.schoolId))
    return res.status(404).json({ error: 'Parent not found' });
  const { sets, vals } = patchBuilder(req.body || {}, {
    first_name: str,
    last_name: str,
    email: (v) => str(v).toLowerCase(),
    phone: str,
  });
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE parents SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`).run(
    ...vals,
    req.params.id,
    req.schoolId
  );
  res.json({ ok: true });
});

router.delete('/parents/:id', (req, res) => {
  const info = db.prepare('DELETE FROM parents WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId);
  if (!info.changes) return res.status(404).json({ error: 'Parent not found' });
  res.json({ ok: true });
});

router.get('/students', (req, res) => {
  const rows = db
    .prepare(
      `SELECT st.*, c.class_name || ' ' || c.arm AS class_label,
        p.first_name || ' ' || p.last_name AS parent_name
       FROM students st
       LEFT JOIN class_arms c ON c.id = st.class_arm_id
       LEFT JOIN parents p ON p.id = st.parent_id
       WHERE st.school_id = ? ORDER BY st.last_name, st.first_name`
    )
    .all(req.schoolId);
  res.json(rows);
});

function nextAdmissionNo(schoolId) {
  const school = db.prepare('SELECT code FROM schools WHERE id = ?').get(schoolId);
  const suffix = String(school.code).replace(/^EDU-/, '');
  const year = String(new Date().getFullYear()).slice(-2);
  const count = db.prepare('SELECT COUNT(*) AS c FROM students WHERE school_id = ?').get(schoolId).c;
  let seq = count + 1;
  while (true) {
    const candidate = `${suffix}/${year}/${String(seq).padStart(4, '0')}`;
    const exists = db
      .prepare('SELECT id FROM students WHERE school_id = ? AND admission_no = ?')
      .get(schoolId, candidate);
    if (!exists) return candidate;
    seq++;
  }
}

router.post('/students', (req, res) => {
  const body = req.body || {};
  const firstName = str(body.first_name);
  const lastName = str(body.last_name);
  if (!firstName || !lastName) return bad(res, 'Student full name is required');
  if (body.class_arm_id && !getOwned('class_arms', num(body.class_arm_id), req.schoolId))
    return bad(res, 'Selected class does not belong to your school');
  if (body.parent_id && !getOwned('parents', num(body.parent_id), req.schoolId))
    return bad(res, 'Selected parent does not belong to your school');
  const admissionNo = nextAdmissionNo(req.schoolId);
  const result = db
    .prepare(
      `INSERT INTO students (school_id, admission_no, first_name, last_name, gender, admission_date, class_arm_id, parent_id)
       VALUES (?, ?, ?, ?, ?, COALESCE(NULLIF(?, ''), date('now')), ?, ?)`
    )
    .run(
      req.schoolId,
      admissionNo,
      firstName,
      lastName,
      str(body.gender),
      str(body.admission_date),
      num(body.class_arm_id),
      num(body.parent_id)
    );
  res.status(201).json({ ok: true, id: Number(result.lastInsertRowid), admission_no: admissionNo });
});

router.patch('/students/:id', (req, res) => {
  if (!getOwned('students', req.params.id, req.schoolId))
    return res.status(404).json({ error: 'Student not found' });
  const body = req.body || {};
  if (body.class_arm_id && !getOwned('class_arms', num(body.class_arm_id), req.schoolId))
    return bad(res, 'Selected class does not belong to your school');
  if (body.parent_id && !getOwned('parents', num(body.parent_id), req.schoolId))
    return bad(res, 'Selected parent does not belong to your school');
  const { sets, vals } = patchBuilder(body, {
    first_name: str,
    last_name: str,
    gender: str,
    admission_date: str,
    class_arm_id: num,
    parent_id: num,
    status: str,
  });
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE students SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`).run(
    ...vals,
    req.params.id,
    req.schoolId
  );
  res.json({ ok: true });
});

router.delete('/students/:id', (req, res) => {
  const info = db.prepare('DELETE FROM students WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId);
  if (!info.changes) return res.status(404).json({ error: 'Student not found' });
  res.json({ ok: true });
});

router.get('/announcements', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM announcements WHERE school_id = ? ORDER BY datetime(created_at) DESC, id DESC')
    .all(req.schoolId);
  res.json(rows);
});

router.post('/announcements', (req, res) => {
  const body = req.body || {};
  const title = str(body.title);
  const text = str(body.body);
  if (!title || !text) return bad(res, 'Title and message are required');
  const audience = ['all', 'teachers', 'students', 'parents'].includes(body.audience) ? body.audience : 'all';
  const result = db
    .prepare('INSERT INTO announcements (school_id, title, body, audience, author_id) VALUES (?, ?, ?, ?, ?)')
    .run(req.schoolId, title, text, audience, req.user.id);
  res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
});

router.delete('/announcements/:id', (req, res) => {
  const info = db.prepare('DELETE FROM announcements WHERE id = ? AND school_id = ?').run(req.params.id, req.schoolId);
  if (!info.changes) return res.status(404).json({ error: 'Announcement not found' });
  res.json({ ok: true });
});

module.exports = router;
