/**
 * DEVELOPMENT / DEMO SEED. Creates clearly-labelled demo data. Never run against production.
 * Usage: npm run seed   (add --reset to wipe the local DB first)
 */
import fs from 'node:fs';
import { env } from './config/env.js';
import { getDb, transaction } from './db/connection.js';
import { hashPassword } from './core/crypto.js';
import { computeGrade, DEFAULT_GRADING_SCALE } from './modules/results/grading.js';

if (env.isProd) { console.error('Refusing to seed in production'); process.exit(1); }
if (process.argv.includes('--reset') && env.DATABASE_URL !== ':memory:') for (const f of [env.DATABASE_URL, `${env.DATABASE_URL}-wal`, `${env.DATABASE_URL}-shm`]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

const db = getDb();
const PASSWORD = 'Password123!';
const first = ['Adaeze', 'Tunde', 'Chiamaka', 'Emeka', 'Fatima', 'Ibrahim', 'Ngozi', 'Segun', 'Amina', 'Kelechi', 'Yusuf', 'Bisi', 'Obinna', 'Halima', 'Femi', 'Zainab', 'Chidi', 'Aisha', 'Kunle', 'Uche', 'Musa', 'Ifeoma', 'Dayo', 'Hauwa', 'Tobi', 'Nneka', 'Sule', 'Funke', 'Ikenna', 'Rukayat'];
const last = ['Okafor', 'Adeyemi', 'Bello', 'Eze', 'Balogun', 'Nwachukwu', 'Abdullahi', 'Olawale', 'Ogunleye', 'Ibrahim', 'Chukwu', 'Adebayo', 'Mohammed', 'Okonkwo', 'Lawal'];
const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

async function main() {
  if (db.prepare("SELECT 1 FROM schools WHERE code = 'EDU-DEMO01'").get()) { console.log('Demo data already present. Run with --reset to recreate.'); return; }
  const hash = await hashPassword(PASSWORD);

  transaction(() => {
    // Super admin (platform)
    db.prepare("INSERT OR IGNORE INTO users (school_id, role, first_name, last_name, email, password_hash, email_verified) VALUES (NULL,'SUPER_ADMIN','Platform','Admin','super@eduos.dev',?,1)").run(hash);

    // Demo school
    const sid = Number(db.prepare("INSERT INTO schools (code, name, address, phone, email, type, status, onboarding_complete, grading_scale) VALUES ('EDU-DEMO01','Greenfield Secondary School (Demo)','12 Adeola Odeku Street, Victoria Island, Lagos','08012345678','info@greenfield.demo','private','active',1,?)").run(JSON.stringify(DEFAULT_GRADING_SCALE)).lastInsertRowid);
    const adminId = Number(db.prepare("INSERT INTO users (school_id, role, first_name, last_name, email, password_hash, email_verified) VALUES (?,'SCHOOL_ADMIN','Folake','Adeyemi','admin@greenfield.demo',?,1)").run(sid, hash).lastInsertRowid);

    // Sessions
    const prevSession = Number(db.prepare("INSERT INTO academic_sessions (school_id, name, status, start_date, end_date) VALUES (?,'2025/2026','archived','2025-09-08','2026-07-24')").run(sid).lastInsertRowid);
    const session = Number(db.prepare("INSERT INTO academic_sessions (school_id, name, status, start_date, end_date) VALUES (?,'2026/2027','active','2026-09-14','2027-07-23')").run(sid).lastInsertRowid);
    const terms: number[] = [];
    ['First Term', 'Second Term', 'Third Term'].forEach((n, i) => {
      db.prepare('INSERT INTO terms (school_id, session_id, name, sequence) VALUES (?,?,?,?)').run(sid, prevSession, n, i + 1);
      terms.push(Number(db.prepare('INSERT INTO terms (school_id, session_id, name, sequence, is_current) VALUES (?,?,?,?,?)').run(sid, session, n, i + 1, i === 0 ? 1 : 0).lastInsertRowid));
    });

    // Teachers
    const teacherDefs = [['Tunde', 'Bakare', 'Mathematics'], ['Ngozi', 'Okoro', 'English Language'], ['Ibrahim', 'Sani', 'Physics'], ['Chioma', 'Nwosu', 'Chemistry'], ['Segun', 'Alabi', 'Biology'], ['Amaka', 'Obi', 'Economics'], ['Yusuf', 'Garba', 'Civic Education'], ['Bisi', 'Fashola', 'Basic Science']];
    const teachers = teacherDefs.map(([f, l]) => {
      const email = `${f.toLowerCase()}.${l.toLowerCase()}@greenfield.demo`;
      const uid = Number(db.prepare("INSERT INTO users (school_id, role, first_name, last_name, email, password_hash, email_verified) VALUES (?,'TEACHER',?,?,?,?,1)").run(sid, f, l, email, hash).lastInsertRowid);
      return Number(db.prepare('INSERT INTO teachers (school_id, user_id, first_name, last_name, email, phone) VALUES (?,?,?,?,?,?)').run(sid, uid, f, l, email, '0803' + String(uid).padStart(7, '0')).lastInsertRowid);
    });

    // Subjects
    const subjectDefs: [string, string, string, string | null][] = [['Mathematics', 'MTH', 'core', null], ['English Language', 'ENG', 'core', null], ['Civic Education', 'CIV', 'core', null], ['Basic Science', 'BSC', 'core', null], ['Physics', 'PHY', 'elective', 'science'], ['Chemistry', 'CHM', 'elective', 'science'], ['Biology', 'BIO', 'elective', 'science'], ['Economics', 'ECO', 'elective', 'commercial'], ['Government', 'GOV', 'elective', 'art'], ['Literature in English', 'LIT', 'elective', 'art']];
    const subjects: Record<string, number> = {};
    for (const [n, c, k, t] of subjectDefs) subjects[n] = Number(db.prepare('INSERT INTO subjects (school_id, name, code, kind, track) VALUES (?,?,?,?,?)').run(sid, n, c, k, t).lastInsertRowid);

    // Classes
    const classDefs: [string, string, number][] = [['JSS1', 'A', 7], ['JSS2', 'A', 6], ['JSS3', 'A', 1], ['SS1', 'Science', 0], ['SS2', 'Science', 2], ['SS3', 'Art', 5]];
    const classes = classDefs.map(([lvl, arm, ct]) => Number(db.prepare('INSERT INTO class_arms (school_id, session_id, level, arm, capacity, class_teacher_id) VALUES (?,?,?,?,40,?)').run(sid, session, lvl, arm, teachers[ct]).lastInsertRowid));
    const prevClasses = classDefs.map(([lvl, arm]) => Number(db.prepare('INSERT INTO class_arms (school_id, session_id, level, arm, capacity, status) VALUES (?,?,?,?,40,\'archived\')').run(sid, prevSession, lvl, arm).lastInsertRowid));

    // Teaching assignments
    const teach = (ci: number, subj: string, ti: number) => db.prepare('INSERT INTO class_subjects (school_id, class_arm_id, subject_id, teacher_id) VALUES (?,?,?,?)').run(sid, classes[ci], subjects[subj], teachers[ti]);
    for (const ci of [0, 1, 2]) { teach(ci, 'Mathematics', 0); teach(ci, 'English Language', 1); teach(ci, 'Basic Science', 7); teach(ci, 'Civic Education', 6); }
    for (const ci of [3, 4]) { teach(ci, 'Mathematics', 0); teach(ci, 'English Language', 1); teach(ci, 'Physics', 2); teach(ci, 'Chemistry', 3); teach(ci, 'Biology', 4); teach(ci, 'Civic Education', 6); }
    teach(5, 'Mathematics', 0); teach(5, 'English Language', 1); teach(5, 'Economics', 5); teach(5, 'Civic Education', 6);

    // Parents & students
    const parents: number[] = [];
    for (let i = 0; i < 18; i++) {
      const f = pick(first, i + 7), l = pick(last, i);
      const email = `parent${i + 1}@greenfield.demo`;
      const uid = i < 6 ? Number(db.prepare("INSERT INTO users (school_id, role, first_name, last_name, email, password_hash, email_verified) VALUES (?,'PARENT',?,?,?,?,1)").run(sid, f, l, email, hash).lastInsertRowid) : null;
      parents.push(Number(db.prepare('INSERT INTO parents (school_id, user_id, first_name, last_name, email, phone) VALUES (?,?,?,?,?,?)').run(sid, uid, f, l, email, '0805' + String(1000000 + i)).lastInsertRowid));
    }
    const students: number[][] = classes.map(() => []);
    let n = 0;
    classes.forEach((cid, ci) => {
      const count = 8 + (ci % 3);
      for (let k = 0; k < count; k++, n++) {
        const f = pick(first, n), l = pick(last, n * 3 + ci);
        const email = `student${n + 1}@greenfield.demo`;
        const uid = n < 12 ? Number(db.prepare("INSERT INTO users (school_id, role, first_name, last_name, email, password_hash, email_verified) VALUES (?,'STUDENT',?,?,?,?,1)").run(sid, f, l, email, hash).lastInsertRowid) : null;
        const stId = Number(db.prepare("INSERT INTO students (school_id, user_id, admission_no, first_name, last_name, gender, date_of_birth, admission_date) VALUES (?,?,?,?,?,?,?,?)")
          .run(sid, uid, `GFS/${25 - Math.min(ci, 5)}/${String(n + 1).padStart(4, '0')}`, f, l, n % 2 ? 'female' : 'male', `${2009 + (5 - ci)}-0${(n % 9) + 1}-1${n % 9}`, '2024-09-09').lastInsertRowid);
        db.prepare('INSERT INTO enrollments (school_id, student_id, session_id, class_arm_id) VALUES (?,?,?,?)').run(sid, stId, session, cid);
        if (ci > 0) db.prepare("INSERT INTO enrollments (school_id, student_id, session_id, class_arm_id, outcome) VALUES (?,?,?,?,'promoted')").run(sid, stId, prevSession, prevClasses[ci - 1]);
        db.prepare("INSERT INTO student_parents (student_id, parent_id, school_id, relationship) VALUES (?,?,?,?)").run(stId, parents[n % parents.length], sid, n % 2 ? 'Mother' : 'Father');
        students[ci].push(stId);
      }
    });

    // Results: SS2 Science first-term sheets fully published; JSS1 Mathematics submitted (awaiting approval); others draft
    const sheet = (ci: number, subj: string, ti: number, status: string) => {
      const rsId = Number(db.prepare(`INSERT INTO result_sheets (school_id, session_id, term_id, class_arm_id, subject_id, teacher_id, status, submitted_at, approved_at, published_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(sid, session, terms[0], classes[ci], subjects[subj], teachers[ti], status, status !== 'DRAFT' ? '2026-12-01 10:00:00' : null, ['APPROVED', 'PUBLISHED'].includes(status) ? '2026-12-03 09:00:00' : null, status === 'PUBLISHED' ? '2026-12-05 12:00:00' : null).lastInsertRowid);
      students[ci].forEach((stId, i) => {
        const ca1 = 10 + ((i * 7 + ci) % 11), ca2 = 9 + ((i * 5 + ci * 3) % 12), exam = 25 + ((i * 13 + ci * 7) % 36);
        const total = ca1 + ca2 + exam; const g = computeGrade(total, DEFAULT_GRADING_SCALE);
        db.prepare('INSERT INTO results (school_id, sheet_id, student_id, ca1, ca2, exam, total, grade, remark) VALUES (?,?,?,?,?,?,?,?,?)').run(sid, rsId, stId, ca1, ca2, exam, total, g.grade, g.remark);
      });
    };
    [['Mathematics', 0], ['English Language', 1], ['Physics', 2], ['Chemistry', 3], ['Biology', 4], ['Civic Education', 6]].forEach(([s, t]) => sheet(4, s as string, t as number, 'PUBLISHED'));
    sheet(0, 'Mathematics', 0, 'SUBMITTED'); sheet(0, 'English Language', 1, 'SUBMITTED'); sheet(1, 'Mathematics', 0, 'DRAFT'); sheet(5, 'Economics', 5, 'APPROVED');

    // Attendance for the last 15 school days
    const today = new Date();
    for (let d = 1, days = 0; days < 15; d++) {
      const date = new Date(today); date.setDate(today.getDate() - d);
      if (date.getDay() === 0 || date.getDay() === 6) continue; days++;
      const iso = date.toISOString().slice(0, 10);
      classes.forEach((cid, ci) => students[ci].forEach((stId, i) => {
        const r = (i * 31 + days * 7 + ci) % 20;
        db.prepare("INSERT INTO attendance (school_id, class_arm_id, term_id, student_id, date, status, marked_by) VALUES (?,?,?,?,?,?,?)").run(sid, cid, terms[0], stId, iso, r === 0 ? 'absent' : r === 1 ? 'late' : 'present', adminId);
      }));
    }

    // Timetable for SS2 Science
    const slots = [['08:00', '08:40'], ['08:40', '09:20'], ['09:20', '10:00'], ['10:20', '11:00'], ['11:00', '11:40']];
    const rota = ['Mathematics', 'English Language', 'Physics', 'Chemistry', 'Biology', 'Civic Education'];
    for (let day = 1; day <= 5; day++) slots.forEach(([s, e], i) => {
      const subj = rota[(i + day) % rota.length];
      const t = (db.prepare('SELECT teacher_id FROM class_subjects WHERE class_arm_id = ? AND subject_id = ?').get(classes[4], subjects[subj]) as any)?.teacher_id;
      db.prepare('INSERT INTO timetable_entries (school_id, class_arm_id, subject_id, teacher_id, day_of_week, start_time, end_time) VALUES (?,?,?,?,?,?,?)').run(sid, classes[4], subjects[subj], t ?? null, day, s, e);
    });

    // Assignments & materials
    const aId = Number(db.prepare("INSERT INTO assignments (school_id, class_arm_id, subject_id, teacher_id, term_id, title, description, due_at, max_score, status) VALUES (?,?,?,?,?,?,?,?,?,'published')")
      .run(sid, classes[4], subjects['Mathematics'], teachers[0], terms[0], 'Quadratic equations practice', 'Solve questions 1-10 on page 42. Show all working.', new Date(Date.now() + 5 * 864e5).toISOString(), 20).lastInsertRowid);
    db.prepare("INSERT INTO assignment_submissions (school_id, assignment_id, student_id, body, status) VALUES (?,?,?,?,'submitted')").run(sid, aId, students[4][0], 'Attached my working for Q1-Q10.');
    db.prepare("INSERT INTO materials (school_id, session_id, class_arm_id, subject_id, teacher_id, title, description, category, external_url) VALUES (?,?,?,?,?,?,?,?,?)")
      .run(sid, session, classes[4], subjects['Physics'], teachers[2], 'Motion in a straight line - lesson notes', 'Covers displacement, velocity, acceleration and equations of motion.', 'note', 'https://en.wikipedia.org/wiki/Equations_of_motion');
    db.prepare("INSERT INTO materials (school_id, session_id, subject_id, teacher_id, title, description, category, external_url) VALUES (?,?,?,?,?,?,?,?)")
      .run(sid, session, subjects['Mathematics'], teachers[0], 'Khan Academy: Algebra basics', 'Whole-school reference resource.', 'video', 'https://www.khanacademy.org/math/algebra');

    // Announcements
    db.prepare("INSERT INTO announcements (school_id, author_id, title, content, audience) VALUES (?,?,?,?,?)").run(sid, adminId, 'First term examinations begin 30 November', 'All students should collect their exam timetables from class teachers. Parents are encouraged to supervise revision at home.', 'all');
    db.prepare("INSERT INTO announcements (school_id, author_id, title, content, audience) VALUES (?,?,?,?,?)").run(sid, adminId, 'Staff meeting - Friday 2pm', 'Agenda: result submission deadlines, attendance compliance, and the inter-house sports schedule.', 'teachers');
    db.prepare("INSERT INTO announcements (school_id, author_id, title, content, audience) VALUES (?,?,?,?,?)").run(sid, adminId, 'PTA meeting - Saturday 10am', 'The termly PTA meeting holds in the school hall. Attendance is important.', 'parents');

    // Past questions (original, platform-authored practice items - not reproduced from exam bodies)
    const pq: [string, number, string, string, string, string[], number, string][] = [
      ['WAEC', 2023, 'Mathematics', 'Algebra', 'Solve for x: 2x + 6 = 14', ['2', '4', '6', '10'], 1, '2x = 8, so x = 4.'],
      ['WAEC', 2023, 'Mathematics', 'Geometry', 'The sum of interior angles of a triangle is', ['90°', '180°', '270°', '360°'], 1, 'Angle sum of a triangle is always 180°.'],
      ['JAMB', 2024, 'Physics', 'Kinematics', 'A body moving with uniform velocity has', ['zero acceleration', 'increasing acceleration', 'constant non-zero acceleration', 'decreasing velocity'], 0, 'Uniform velocity means no change in velocity, so acceleration is zero.'],
      ['NECO', 2022, 'English Language', 'Grammar', 'Choose the correct option: Neither of the boys ___ here.', ['are', 'is', 'were', 'have been'], 1, '"Neither" takes a singular verb.'],
      ['BECE', 2023, 'Basic Science', 'Matter', 'Which of these is NOT a state of matter?', ['Solid', 'Liquid', 'Gas', 'Energy'], 3, 'Energy is not a state of matter.'],
    ];
    for (const [exam, year, subj, topic, q, opts, ans, exp] of pq) db.prepare("INSERT INTO past_questions (school_id, exam, year, subject, topic, question, options, answer, explanation, source_note) VALUES (NULL,?,?,?,?,?,?,?,?,'EduOS original practice item')").run(exam as string, year as number, subj as string, topic as string, q as string, JSON.stringify(opts), String(ans), exp as string);

    db.prepare("INSERT INTO audit_logs (school_id, actor_id, action, entity_type, metadata) VALUES (?,?,'SEED_DATA_LOADED','school','{\"note\":\"development demo data\"}')").run(sid, adminId);
  });

  console.log(`
Demo data loaded (password for every account: ${PASSWORD})

  Super Admin      super@eduos.dev
  School Admin     admin@greenfield.demo
  Teacher (Maths)  tunde.bakare@greenfield.demo
  Teacher (Phys)   ibrahim.sani@greenfield.demo
  Student (SS2)    student1@greenfield.demo   ... student12@greenfield.demo
  Parent           parent1@greenfield.demo    ... parent6@greenfield.demo
`);
}
main().catch((e) => { console.error(e); process.exit(1); });
