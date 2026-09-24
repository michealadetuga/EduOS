import { Link, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuery, useAction } from '@/lib/hooks';
import { Alert, Button, Icon, PageHeader, QueryBoundary, cx } from '@/components/ui';

const links: Record<string, { to: string; help: string }> = {
  profile: { to: '/admin/school', help: 'Add your address, phone and contact email. Upload a logo for report cards.' },
  session: { to: '/admin/sessions', help: 'Create the current academic session, e.g. 2026/2027. The first session is activated automatically.' },
  terms: { to: '/admin/sessions', help: 'First, Second and Third Term are created with the session. Adjust dates if needed.' },
  classes: { to: '/admin/classes', help: 'Create classes like JSS1 A or SS2 Science and optionally assign class teachers.' },
  subjects: { to: '/admin/subjects', help: 'Add subjects, mark them core or elective, then attach them to classes with a teacher.' },
  teachers: { to: '/admin/teachers', help: 'Add teachers. Each gets an activation email to set their own password.' },
  students: { to: '/admin/students/import', help: 'Import students from CSV or add them one at a time.' },
  parents: { to: '/admin/parents', help: 'Create parents and link them to their children so they can see results and attendance.' },
};

export function OnboardingPage() {
  const q = useQuery(() => api.get<{ steps: any[]; complete: boolean; requiredDone: boolean }>('/api/schools/me/onboarding'), []);
  const { refresh } = useAuth(); const nav = useNavigate();
  const finish = useAction(async () => { await api.post('/api/schools/me/onboarding/complete'); await refresh(); nav('/admin'); });
  const steps = q.data?.steps ?? [];
  const done = steps.filter((s) => s.done).length;
  return (
    <>
      <PageHeader title="Set up your school" description="Complete these steps to get EduOS ready for teachers, students and parents. Optional steps can be finished later." />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        <div className="card mb-6 p-5"><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">{done} of {steps.length} steps complete</span><span className="text-slate-500">{Math.round((done / Math.max(1, steps.length)) * 100)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-600 transition-all" style={{ width: `${(done / Math.max(1, steps.length)) * 100}%` }} /></div></div>
        <ol className="space-y-3">{steps.map((s, i) => (
          <li key={s.key} className={cx('card flex flex-col gap-3 p-4 sm:flex-row sm:items-center', s.done && 'border-emerald-200 bg-emerald-50/40')}>
            <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold', s.done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600')}>{s.done ? <Icon.Check className="h-4 w-4" /> : i + 1}</div>
            <div className="flex-1"><div className="flex items-center gap-2 font-medium">{s.label}{!s.required && <span className="text-xs font-normal text-slate-400">Optional</span>}</div><p className="text-sm text-slate-500">{links[s.key]?.help}</p></div>
            <Link to={links[s.key]?.to ?? '/admin'}><Button variant={s.done ? 'outline' : 'primary'} size="sm">{s.done ? 'Review' : 'Set up'}</Button></Link>
          </li>))}</ol>
        <div className="mt-6 flex flex-col items-start gap-3">
          {finish.error && <Alert tone="error">{finish.error}</Alert>}
          {q.data?.requiredDone ? <Button onClick={() => finish.run()} loading={finish.pending}>Finish setup and go to dashboard</Button> : <p className="text-sm text-slate-500">Complete the required steps to finish setup. You can still use the dashboard in the meantime: <Link className="text-brand-700 underline" to="/admin">go to dashboard</Link>.</p>}
        </div>
      </QueryBoundary>
    </>
  );
}
