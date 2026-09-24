import type { DatabaseSync } from 'node:sqlite';

/**
 * Pooled (shared-table) multi-tenant schema. Every school-owned row carries school_id.
 * Uniqueness constraints are tenant-aware (scoped by school_id).
 */
export function applySchema(db: DatabaseSync) {
  db.exec(`
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT, phone TEXT, email TEXT, type TEXT, logo_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended')),
  onboarding_step INTEGER NOT NULL DEFAULT 0,
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  grading_scale TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_schools_status ON schools(status, created_at);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER REFERENCES schools(id),
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','SCHOOL_ADMIN','TEACHER','STUDENT','PARENT')),
  first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  must_change_password INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_school_role ON users(school_id, role);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('verify','reset','invite')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  ip TEXT, user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS academic_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  start_date TEXT, end_date TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(school_id, name)
);
CREATE INDEX IF NOT EXISTS idx_sessions_school_status ON academic_sessions(school_id, status);

CREATE TABLE IF NOT EXISTS terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  session_id INTEGER NOT NULL REFERENCES academic_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL, sequence INTEGER NOT NULL DEFAULT 1,
  start_date TEXT, end_date TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  UNIQUE(session_id, name)
);
CREATE INDEX IF NOT EXISTS idx_terms_school ON terms(school_id, session_id);

CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE, phone TEXT,
  employment_status TEXT NOT NULL DEFAULT 'full_time' CHECK (employment_status IN ('full_time','part_time','contract','inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(school_id, email)
);
CREATE INDEX IF NOT EXISTS idx_teachers_school ON teachers(school_id, last_name);

CREATE TABLE IF NOT EXISTS class_arms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  session_id INTEGER NOT NULL REFERENCES academic_sessions(id),
  level TEXT NOT NULL, arm TEXT NOT NULL DEFAULT 'A',
  capacity INTEGER,
  class_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(school_id, session_id, level, arm)
);
CREATE INDEX IF NOT EXISTS idx_class_arms_school ON class_arms(school_id, session_id);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL, code TEXT,
  kind TEXT NOT NULL DEFAULT 'core' CHECK (kind IN ('core','elective')),
  track TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(school_id, name)
);
CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);

-- Subject offered in a class arm, taught by a teacher (teaching assignment)
CREATE TABLE IF NOT EXISTS class_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  class_arm_id INTEGER NOT NULL REFERENCES class_arms(id) ON DELETE CASCADE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  UNIQUE(class_arm_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher ON class_subjects(school_id, teacher_id);

CREATE TABLE IF NOT EXISTS parents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  email TEXT COLLATE NOCASE, phone TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parents_school ON parents(school_id, last_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_parents_school_email ON parents(school_id, email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  admission_no TEXT NOT NULL,
  first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male','female') OR gender IS NULL),
  date_of_birth TEXT, admission_date TEXT, photo_key TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','graduated')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(school_id, admission_no)
);
CREATE INDEX IF NOT EXISTS idx_students_school ON students(school_id, status, last_name);

CREATE TABLE IF NOT EXISTS student_parents (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  relationship TEXT,
  PRIMARY KEY (student_id, parent_id)
);
CREATE INDEX IF NOT EXISTS idx_student_parents_parent ON student_parents(parent_id);

CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id INTEGER NOT NULL REFERENCES academic_sessions(id),
  class_arm_id INTEGER NOT NULL REFERENCES class_arms(id),
  outcome TEXT CHECK (outcome IN ('promoted','repeated','graduated','transferred') OR outcome IS NULL),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, session_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON enrollments(school_id, session_id, class_arm_id);

CREATE TABLE IF NOT EXISTS result_sheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  session_id INTEGER NOT NULL REFERENCES academic_sessions(id),
  term_id INTEGER NOT NULL REFERENCES terms(id),
  class_arm_id INTEGER NOT NULL REFERENCES class_arms(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  teacher_id INTEGER REFERENCES teachers(id),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','REVIEW','APPROVED','REJECTED','PUBLISHED')),
  review_note TEXT,
  submitted_at TEXT, approved_at TEXT, published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(term_id, class_arm_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_result_sheets_school ON result_sheets(school_id, session_id, term_id, status);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  sheet_id INTEGER NOT NULL REFERENCES result_sheets(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  ca1 REAL, ca2 REAL, exam REAL,
  total REAL, grade TEXT, remark TEXT, teacher_comment TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sheet_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_results_student ON results(school_id, student_id);

CREATE TABLE IF NOT EXISTS report_card_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term_id INTEGER NOT NULL REFERENCES terms(id),
  class_teacher_comment TEXT, admin_comment TEXT,
  UNIQUE(student_id, term_id)
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  class_arm_id INTEGER NOT NULL REFERENCES class_arms(id),
  term_id INTEGER REFERENCES terms(id),
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','late','excused')),
  marked_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(student_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_class_date ON attendance(school_id, class_arm_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(school_id, student_id, date);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_files_school ON files(school_id);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  class_arm_id INTEGER NOT NULL REFERENCES class_arms(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  teacher_id INTEGER NOT NULL REFERENCES teachers(id),
  term_id INTEGER REFERENCES terms(id),
  title TEXT NOT NULL, description TEXT,
  file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  due_at TEXT, max_score REAL NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(school_id, class_arm_id, status);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  body TEXT, file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  score REAL, feedback TEXT, graded_at TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','graded','returned')),
  UNIQUE(assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  session_id INTEGER REFERENCES academic_sessions(id),
  class_arm_id INTEGER REFERENCES class_arms(id) ON DELETE SET NULL,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  title TEXT NOT NULL, description TEXT,
  category TEXT NOT NULL DEFAULT 'note' CHECK (category IN ('note','textbook','slides','video','worksheet','past_question','other')),
  file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  external_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_materials_school ON materials(school_id, subject_id, class_arm_id);

CREATE TABLE IF NOT EXISTS past_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER REFERENCES schools(id),
  exam TEXT NOT NULL CHECK (exam IN ('WAEC','NECO','BECE','JAMB','INTERNAL')),
  year INTEGER NOT NULL, subject TEXT NOT NULL, topic TEXT,
  question TEXT NOT NULL, options TEXT NOT NULL, answer TEXT NOT NULL, explanation TEXT,
  source_note TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_past_questions ON past_questions(exam, subject, year);

CREATE TABLE IF NOT EXISTS practice_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam TEXT NOT NULL, subject TEXT NOT NULL,
  total INTEGER NOT NULL, correct INTEGER NOT NULL, answers TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS timetable_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  class_arm_id INTEGER NOT NULL REFERENCES class_arms(id) ON DELETE CASCADE,
  subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
  teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  label TEXT,
  UNIQUE(class_arm_id, day_of_week, start_time)
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL REFERENCES schools(id),
  author_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL, content TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all' CHECK (audience IN ('all','teachers','students','parents')),
  publish_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_announcements_school ON announcements(school_id, publish_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER REFERENCES schools(id),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event TEXT NOT NULL, title TEXT NOT NULL, body TEXT, link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER REFERENCES schools(id),
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL, entity_type TEXT, entity_id INTEGER,
  metadata TEXT, ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_school ON audit_logs(school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id, created_at);

CREATE TABLE IF NOT EXISTS support_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  super_admin_id INTEGER NOT NULL REFERENCES users(id),
  school_id INTEGER NOT NULL REFERENCES schools(id),
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL
);
`);
}
