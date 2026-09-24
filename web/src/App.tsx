import { Navigate, Route, Routes, useLocation, Link } from 'react-router-dom';
import { useAuth, homeFor, RequireRole } from '@/lib/auth';
import { AppShell, type NavGroup } from '@/layouts/AppShell';
import { Icon, Button } from '@/components/ui';
import { LandingPage } from '@/pages/marketing/Landing';
import { LoginPage, RegisterPage, VerifyEmailPage, ForgotPasswordPage, SetPasswordPage, ChangePasswordPage } from '@/pages/auth';
import { AdminDashboard } from '@/pages/admin/Dashboard';
import { OnboardingPage } from '@/pages/admin/Onboarding';
import { SchoolProfilePage } from '@/pages/admin/SchoolProfile';
import { SessionsPage } from '@/pages/admin/Sessions';
import { ClassesPage, ClassDetailPage } from '@/pages/admin/Classes';
import { SubjectsPage } from '@/pages/admin/Subjects';
import { TeachersPage, TeacherDetailPage, StudentsPage, StudentDetailPage, StudentImportPage, PromotePage, ParentsPage, ParentDetailPage } from '@/pages/admin/People';
import { ResultsListPage, ResultSheetPage, AdminReportCardPage } from '@/pages/shared/Results';
import { AnnouncementsPage, AdminTimetablePage, LibraryPage, AuditPage } from '@/pages/shared/Misc';
import { TeacherDashboard, AttendancePage, TeacherAssignmentsPage, TeacherAssignmentDetailPage, MyTimetablePage } from '@/pages/teacher';
import { StudentDashboard, StudentAssignmentsPage, StudentAssignmentDetailPage, StudentResultsPage, StudentAttendancePage, StudentTimetablePage, PastQuestionsPage } from '@/pages/student';
import { ParentDashboard, ChildResultsPage, ChildAttendancePage } from '@/pages/parent';
import { PlatformDashboard, SchoolsPage, SchoolDetailPage } from '@/pages/platform';

const ic = 'h-4 w-4';
const adminNav: NavGroup[] = [
  { items: [{ to: '/admin', label: 'Dashboard', icon: <Icon.Home className={ic} />, end: true }] },
  { title: 'Academics', items: [{ to: '/admin/sessions', label: 'Sessions & terms', icon: <Icon.Calendar className={ic} /> }, { to: '/admin/classes', label: 'Classes', icon: <Icon.Grid className={ic} /> }, { to: '/admin/subjects', label: 'Subjects', icon: <Icon.Book className={ic} /> }, { to: '/admin/timetable', label: 'Timetable', icon: <Icon.Layers className={ic} /> }] },
  { title: 'People', items: [{ to: '/admin/students', label: 'Students', icon: <Icon.Users className={ic} /> }, { to: '/admin/teachers', label: 'Teachers', icon: <Icon.User className={ic} /> }, { to: '/admin/parents', label: 'Parents', icon: <Icon.Users className={ic} /> }] },
  { title: 'Learning', items: [{ to: '/admin/results', label: 'Results', icon: <Icon.Chart className={ic} /> }, { to: '/admin/materials', label: 'Materials', icon: <Icon.Library className={ic} /> }, { to: '/admin/past-questions', label: 'Past questions', icon: <Icon.Clipboard className={ic} /> }, { to: '/admin/announcements', label: 'Announcements', icon: <Icon.Megaphone className={ic} /> }] },
  { title: 'School', items: [{ to: '/admin/school', label: 'School profile', icon: <Icon.School className={ic} /> }, { to: '/admin/audit', label: 'Audit log', icon: <Icon.Shield className={ic} /> }] },
];
const teacherNav: NavGroup[] = [{ items: [
  { to: '/teacher', label: 'Dashboard', icon: <Icon.Home className={ic} />, end: true }, { to: '/teacher/attendance', label: 'Attendance', icon: <Icon.Check className={ic} /> }, { to: '/teacher/results', label: 'Results', icon: <Icon.Chart className={ic} /> },
  { to: '/teacher/assignments', label: 'Assignments', icon: <Icon.Clipboard className={ic} /> }, { to: '/teacher/materials', label: 'Materials', icon: <Icon.Library className={ic} /> }, { to: '/teacher/timetable', label: 'Timetable', icon: <Icon.Calendar className={ic} /> }, { to: '/teacher/announcements', label: 'Announcements', icon: <Icon.Megaphone className={ic} /> }] }];
const studentNav: NavGroup[] = [{ items: [
  { to: '/student', label: 'Dashboard', icon: <Icon.Home className={ic} />, end: true }, { to: '/student/assignments', label: 'Assignments', icon: <Icon.Clipboard className={ic} /> }, { to: '/student/results', label: 'Results', icon: <Icon.Chart className={ic} /> },
  { to: '/student/attendance', label: 'Attendance', icon: <Icon.Check className={ic} /> }, { to: '/student/library', label: 'Library', icon: <Icon.Library className={ic} /> }, { to: '/student/past-questions', label: 'Past questions', icon: <Icon.Book className={ic} /> },
  { to: '/student/timetable', label: 'Timetable', icon: <Icon.Calendar className={ic} /> }, { to: '/student/announcements', label: 'Announcements', icon: <Icon.Megaphone className={ic} /> }] }];
const parentNav: NavGroup[] = [{ items: [{ to: '/parent', label: 'My children', icon: <Icon.Users className={ic} />, end: true }, { to: '/parent/announcements', label: 'Announcements', icon: <Icon.Megaphone className={ic} /> }] }];
const platformNav: NavGroup[] = [{ items: [{ to: '/platform', label: 'Overview', icon: <Icon.Home className={ic} />, end: true }, { to: '/platform/schools', label: 'Schools', icon: <Icon.School className={ic} /> }, { to: '/platform/audit', label: 'Audit log', icon: <Icon.Shield className={ic} /> }] }];

function NotFound() {
  const { me } = useAuth();
  return <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center"><div className="text-6xl font-bold text-slate-200">404</div><h1 className="text-xl font-semibold">Page not found</h1><p className="text-sm text-slate-500">The page you're looking for doesn't exist or you don't have access to it.</p><Link to={homeFor(me?.user.role)}><Button>Go home</Button></Link></div>;
}
function Home() { const { me, loading } = useAuth(); const loc = useLocation(); if (loading) return null; return me ? <Navigate to={homeFor(me.user.role)} replace state={{ from: loc }} /> : <LandingPage />; }
const RequireOnboarded = ({ children }: { children: React.ReactNode }) => { const { me } = useAuth(); const loc = useLocation(); if (me?.school && !me.school.onboarding_complete && loc.pathname !== '/admin/onboarding' && loc.pathname !== '/admin/school') return <Navigate to="/admin/onboarding" replace />; return <>{children}</>; };

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /><Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<SetPasswordPage mode="reset" />} /><Route path="/accept-invite" element={<SetPasswordPage mode="invite" />} />
      <Route path="/account/password" element={<RequireRole roles={['SUPER_ADMIN', 'SCHOOL_ADMIN', 'TEACHER', 'STUDENT', 'PARENT']}><ChangePasswordPage /></RequireRole>} />

      <Route path="/admin" element={<RequireRole roles={['SCHOOL_ADMIN']}><RequireOnboarded><AppShell groups={adminNav} brandSub="School admin" /></RequireOnboarded></RequireRole>}>
        <Route index element={<AdminDashboard />} /><Route path="onboarding" element={<OnboardingPage />} /><Route path="school" element={<SchoolProfilePage />} /><Route path="sessions" element={<SessionsPage />} />
        <Route path="classes" element={<ClassesPage />} /><Route path="classes/:id" element={<ClassDetailPage />} /><Route path="subjects" element={<SubjectsPage />} /><Route path="timetable" element={<AdminTimetablePage />} />
        <Route path="teachers" element={<TeachersPage />} /><Route path="teachers/:id" element={<TeacherDetailPage />} />
        <Route path="students" element={<StudentsPage />} /><Route path="students/import" element={<StudentImportPage />} /><Route path="students/promote" element={<PromotePage />} /><Route path="students/:id" element={<StudentDetailPage />} />
        <Route path="parents" element={<ParentsPage />} /><Route path="parents/:id" element={<ParentDetailPage />} />
        <Route path="results" element={<ResultsListPage />} /><Route path="results/:id" element={<ResultSheetPage />} /><Route path="report-card/:studentId/:termId" element={<AdminReportCardPage />} />
        <Route path="materials" element={<LibraryPage manage />} /><Route path="past-questions" element={<PastQuestionsPage />} /><Route path="announcements" element={<AnnouncementsPage />} /><Route path="audit" element={<AuditPage />} />
      </Route>

      <Route path="/teacher" element={<RequireRole roles={['TEACHER']}><AppShell groups={teacherNav} brandSub="Teacher" /></RequireRole>}>
        <Route index element={<TeacherDashboard />} /><Route path="attendance" element={<AttendancePage />} /><Route path="results" element={<ResultsListPage />} /><Route path="results/:id" element={<ResultSheetPage />} />
        <Route path="assignments" element={<TeacherAssignmentsPage />} /><Route path="assignments/:id" element={<TeacherAssignmentDetailPage />} /><Route path="materials" element={<LibraryPage manage />} /><Route path="timetable" element={<MyTimetablePage />} /><Route path="announcements" element={<AnnouncementsPage />} />
      </Route>

      <Route path="/student" element={<RequireRole roles={['STUDENT']}><AppShell groups={studentNav} brandSub="Student" /></RequireRole>}>
        <Route index element={<StudentDashboard />} /><Route path="assignments" element={<StudentAssignmentsPage />} /><Route path="assignments/:id" element={<StudentAssignmentDetailPage />} /><Route path="results" element={<StudentResultsPage />} /><Route path="results/:termId" element={<StudentResultsPage />} />
        <Route path="attendance" element={<StudentAttendancePage />} /><Route path="library" element={<LibraryPage />} /><Route path="past-questions" element={<PastQuestionsPage />} /><Route path="timetable" element={<StudentTimetablePage />} /><Route path="announcements" element={<AnnouncementsPage />} />
      </Route>

      <Route path="/parent" element={<RequireRole roles={['PARENT']}><AppShell groups={parentNav} brandSub="Parent" /></RequireRole>}>
        <Route index element={<ParentDashboard />} /><Route path="children/:id/results/:termId" element={<ChildResultsPage />} /><Route path="children/:id/attendance" element={<ChildAttendancePage />} /><Route path="announcements" element={<AnnouncementsPage />} />
      </Route>

      <Route path="/platform" element={<RequireRole roles={['SUPER_ADMIN']}><AppShell groups={platformNav} brandSub="Platform" /></RequireRole>}>
        <Route index element={<PlatformDashboard />} /><Route path="schools" element={<SchoolsPage />} /><Route path="schools/:id" element={<SchoolDetailPage />} /><Route path="audit" element={<AuditPage platform />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
