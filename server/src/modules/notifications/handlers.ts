import { subscribe } from '../../core/events.js';
import { mailer } from '../../core/mailer.js';
import { getDb } from '../../db/connection.js';

function notify(userIds: number[], schoolId: number | null, event: string, title: string, body: string, link?: string) {
  const stmt = getDb().prepare('INSERT INTO notifications (school_id, user_id, event, title, body, link) VALUES (?,?,?,?,?,?)');
  for (const id of userIds) stmt.run(schoolId, id, event, title, body, link ?? null);
}
const adminsOf = (schoolId: number) =>
  (getDb().prepare("SELECT id FROM users WHERE school_id = ? AND role = 'SCHOOL_ADMIN' AND status='active'").all(schoolId) as { id: number }[]).map((r) => r.id);

export function registerNotificationHandlers() {
  subscribe(async (e) => {
    switch (e.type) {
      case 'SCHOOL_REGISTERED':
        await mailer.send({ to: e.email, subject: 'Verify your email - EduOS', text: `Hi ${e.name},\n\nWelcome to EduOS. Confirm your email to activate your school:\n\n${e.verifyUrl}\n\nThis link expires in 24 hours.` });
        break;
      case 'PASSWORD_RESET_REQUESTED':
        await mailer.send({ to: e.email, subject: 'Reset your EduOS password', text: `Hi ${e.name},\n\nReset your password using this link (valid for 1 hour):\n\n${e.resetUrl}\n\nIf you did not request this, ignore this email.` });
        break;
      case 'USER_CREATED':
        if (e.inviteUrl) await mailer.send({ to: e.email, subject: 'Your EduOS account', text: `Hi ${e.name},\n\nAn EduOS ${e.role.toLowerCase().replace('_', ' ')} account has been created for you. Set your password to get started:\n\n${e.inviteUrl}\n\nThis link expires in 7 days.` });
        break;
      case 'RESULT_SUBMITTED':
        notify(adminsOf(e.schoolId), e.schoolId, e.type, 'Results submitted for review', 'A teacher submitted a result sheet for your approval.', `/admin/results/${e.sheetId}`);
        break;
      case 'RESULT_APPROVED':
      case 'RESULT_REJECTED':
        if (e.teacherUserId) notify([e.teacherUserId], e.schoolId, e.type, e.type === 'RESULT_APPROVED' ? 'Results approved' : 'Results returned for correction', e.note ?? '', `/teacher/results/${e.sheetId}`);
        break;
      case 'RESULT_PUBLISHED': {
        const rows = getDb().prepare(`
          SELECT DISTINCT u.id FROM enrollments en
          JOIN result_sheets rs ON rs.id = ? AND rs.class_arm_id = en.class_arm_id AND rs.session_id = en.session_id
          JOIN students s ON s.id = en.student_id
          LEFT JOIN student_parents sp ON sp.student_id = s.id
          LEFT JOIN parents p ON p.id = sp.parent_id
          JOIN users u ON (u.id = s.user_id OR u.id = p.user_id)
          WHERE en.school_id = ?`).all(e.sheetId, e.schoolId) as { id: number }[];
        notify(rows.map((r) => r.id), e.schoolId, e.type, 'New results published', 'A new result has been published.', '/results');
        break;
      }
      case 'ASSIGNMENT_POSTED': {
        const rows = getDb().prepare(`SELECT s.user_id AS id FROM enrollments en JOIN students s ON s.id = en.student_id
          JOIN academic_sessions a ON a.id = en.session_id AND a.status = 'active'
          WHERE en.school_id = ? AND en.class_arm_id = ? AND s.user_id IS NOT NULL`).all(e.schoolId, e.classArmId) as { id: number }[];
        notify(rows.map((r) => r.id), e.schoolId, e.type, 'New assignment', e.title, `/student/assignments/${e.assignmentId}`);
        break;
      }
      case 'ANNOUNCEMENT_PUBLISHED': {
        const map: Record<string, string> = { teachers: 'TEACHER', students: 'STUDENT', parents: 'PARENT' };
        const roles = e.audience === 'all' ? ['TEACHER', 'STUDENT', 'PARENT'] : [map[e.audience]];
        const rows = getDb().prepare(`SELECT id FROM users WHERE school_id = ? AND status='active' AND role IN (${roles.map(() => '?').join(',')})`).all(e.schoolId, ...roles) as { id: number }[];
        notify(rows.map((r) => r.id), e.schoolId, e.type, 'New announcement', e.title, '/announcements');
        break;
      }
    }
  });
}
