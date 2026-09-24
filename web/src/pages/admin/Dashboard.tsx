import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuery, fmtDateTime, titleCase } from '@/lib/hooks';
import { Alert, Badge, Button, PageHeader, QueryBoundary, StatCard } from '@/components/ui';

export function AdminDashboard() {
  const { me } = useAuth();
  const q = useQuery(() => api.get<any>('/api/schools/me/dashboard'), []);
  const d = q.data;
  return (
    <>
      <PageHeader title={`Welcome back, ${me?.user.name.split(' ')[0]}`} description={d?.session ? <>{d.session.name} · {d.term?.name ?? 'No current term'}</> : 'No active academic session yet.'} actions={me?.school && !me.school.onboarding_complete && <Link to="/admin/onboarding"><Button>Continue setup</Button></Link>} />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        {d && <>
          {!d.session && <Alert tone="warning" className="mb-6">Create and activate an academic session to start enrolling students and entering results. <Link className="underline" to="/admin/sessions">Go to sessions</Link></Alert>}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Students" value={d.totals.students} to="/admin/students" hint={d.genderSplit.map((g: any) => `${g.c} ${g.gender ?? 'unspecified'}`).join(' · ') || undefined} />
            <StatCard label="Teachers" value={d.totals.teachers} to="/admin/teachers" />
            <StatCard label="Classes" value={d.totals.classes} to="/admin/classes" hint="in the active session" />
            <StatCard label="Subjects" value={d.totals.subjects} to="/admin/subjects" />
          </div>
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-2">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Results awaiting approval</h2><Link to="/admin/results?status=SUBMITTED" className="text-sm text-brand-700 hover:underline">Review</Link></div>
              <div className="flex items-center gap-3"><span className="text-3xl font-semibold">{d.totals.pendingApprovals}</span><span className="text-sm text-slate-500">submitted result sheet{d.totals.pendingApprovals === 1 ? '' : 's'} need your review before publication.</span></div>
              <h2 className="mb-2 mt-6 font-semibold">Recent activity</h2>
              {d.recentActivity.length ? <ul className="divide-y text-sm">{d.recentActivity.map((a: any) => <li key={a.id} className="flex items-center justify-between gap-3 py-2"><span><Badge>{titleCase(a.action.toLowerCase())}</Badge> <span className="text-slate-500">{a.actor ?? 'System'}</span></span><span className="shrink-0 text-xs text-slate-400">{fmtDateTime(a.created_at)}</span></li>)}</ul> : <p className="text-sm text-slate-500">No activity yet.</p>}
            </div>
            <div className="card p-5">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Announcements</h2><Link to="/admin/announcements" className="text-sm text-brand-700 hover:underline">Manage</Link></div>
              {d.announcements.length ? <ul className="space-y-3 text-sm">{d.announcements.map((a: any) => <li key={a.id}><div className="font-medium">{a.title}</div><div className="text-xs text-slate-500">{titleCase(a.audience)} · {fmtDateTime(a.publish_at)}</div></li>)}</ul> : <p className="text-sm text-slate-500">Nothing published yet.</p>}
              <h2 className="mb-2 mt-6 font-semibold">Quick links</h2>
              <div className="flex flex-wrap gap-2">{[['Add student', '/admin/students'], ['Import CSV', '/admin/students/import'], ['Add teacher', '/admin/teachers'], ['Timetable', '/admin/timetable'], ['Audit log', '/admin/audit']].map(([l, to]) => <Link key={to} to={to}><Button size="sm" variant="outline">{l}</Button></Link>)}</div>
            </div>
          </div>
        </>}
      </QueryBoundary>
    </>
  );
}
