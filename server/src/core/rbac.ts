export type Role = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT';

export const PERMISSIONS = [
  'platform.manage', 'platform.schools.view', 'platform.schools.manage', 'platform.support.access',
  'school.view', 'school.update', 'school.onboard',
  'sessions.manage', 'classes.view', 'classes.manage', 'subjects.view', 'subjects.manage',
  'teachers.view', 'teachers.create', 'teachers.update', 'teachers.delete',
  'students.view', 'students.create', 'students.update', 'students.delete', 'students.import', 'students.promote',
  'parents.view', 'parents.manage',
  'results.view', 'results.enter', 'results.update', 'results.submit', 'results.approve', 'results.publish', 'results.view_own',
  'attendance.view', 'attendance.mark', 'attendance.view_own',
  'assignments.view', 'assignments.manage', 'assignments.submit', 'assignments.grade',
  'materials.view', 'materials.manage',
  'library.view', 'past_questions.view', 'past_questions.practice', 'past_questions.manage',
  'timetable.view', 'timetable.manage',
  'announcements.view', 'announcements.manage',
  'audit.view', 'users.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const P = (...p: Permission[]) => new Set<Permission>(p);

export const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  SUPER_ADMIN: P('platform.manage', 'platform.schools.view', 'platform.schools.manage', 'platform.support.access', 'audit.view'),
  SCHOOL_ADMIN: P(
    'school.view', 'school.update', 'school.onboard', 'sessions.manage',
    'classes.view', 'classes.manage', 'subjects.view', 'subjects.manage',
    'teachers.view', 'teachers.create', 'teachers.update', 'teachers.delete',
    'students.view', 'students.create', 'students.update', 'students.delete', 'students.import', 'students.promote',
    'parents.view', 'parents.manage',
    'results.view', 'results.approve', 'results.publish',
    'attendance.view', 'assignments.view', 'materials.view', 'materials.manage', 'library.view',
    'past_questions.view', 'past_questions.manage', 'timetable.view', 'timetable.manage',
    'announcements.view', 'announcements.manage', 'audit.view', 'users.manage',
  ),
  TEACHER: P(
    'school.view', 'classes.view', 'subjects.view', 'students.view',
    'results.view', 'results.enter', 'results.update', 'results.submit',
    'attendance.view', 'attendance.mark',
    'assignments.view', 'assignments.manage', 'assignments.grade',
    'materials.view', 'materials.manage', 'library.view', 'past_questions.view',
    'timetable.view', 'announcements.view',
  ),
  STUDENT: P(
    'school.view', 'results.view_own', 'attendance.view_own', 'assignments.view', 'assignments.submit',
    'materials.view', 'library.view', 'past_questions.view', 'past_questions.practice', 'timetable.view', 'announcements.view',
  ),
  PARENT: P('school.view', 'results.view_own', 'attendance.view_own', 'announcements.view', 'timetable.view'),
};

export function hasPermission(role: Role, perm: Permission) {
  return ROLE_PERMISSIONS[role]?.has(perm) ?? false;
}
