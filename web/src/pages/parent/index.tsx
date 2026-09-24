import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useQuery, fmtDate } from '@/lib/hooks';
import { fullName } from '@/lib/shared';
import { Badge, Button, DataTable, EmptyState, PageHeader, QueryBoundary, Select, StatCard, StatusBadge } from '@/components/ui';
import { ReportCard } from '@/pages/shared/Results';

export function ParentDashboard() {
  const q = useQuery(() => api.get<any[]>('/api/portal/parent/children'), []);
  return (
    <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
      <PageHeader title="My children" description="You only see children your school has linked to your account." />
      {!q.data?.length ? <EmptyState title="No children linked yet" description="Ask your school's administrator to link your children to this account." /> :
        <div className="grid gap-4 md:grid-cols-2">{q.data.map((c) => { const att = Object.fromEntries(c.attendance.map((a: any) => [a.status, a.c])); const total = Object.values(att).reduce((a: number, b: any) => a + b, 0) as number; return (
          <div key={c.id} className="card p-5"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">{fullName(c)}</h2><p className="text-sm text-slate-500">{c.enrollment ? `${c.enrollment.level} ${c.enrollment.arm}` : 'Not enrolled this session'} · {c.admission_no} · {c.relationship ?? 'Guardian'}</p></div><StatusBadge status={c.status} /></div>
            <div className="mt-4 grid grid-cols-2 gap-3"><StatCard label="Attendance" value={total ? `${Math.round(((att.present ?? 0) + (att.late ?? 0)) / total * 100)}%` : '—'} hint={`${att.absent ?? 0} absences`} /><StatCard label="Published results" value={c.publishedTerms.length} hint="terms" /></div>
            <div className="mt-4 flex flex-wrap gap-2">{c.publishedTerms[0] ? <Link to={`/parent/children/${c.id}/results/${c.publishedTerms[0].id}`}><Button size="sm">Latest report card</Button></Link> : <Badge>No results published yet</Badge>}<Link to={`/parent/children/${c.id}/attendance`}><Button size="sm" variant="outline">Attendance</Button></Link></div></div>); })}</div>}
    </QueryBoundary>
  );
}

export function ChildResultsPage() {
  const { id, termId } = useParams(); const nav = useNavigate();
  const kids = useQuery(() => api.get<any[]>('/api/portal/parent/children'), []);
  const child = kids.data?.find((c) => String(c.id) === id);
  const q = useQuery(() => api.get<any>(`/api/portal/parent/children/${id}/results/${termId}`), [id, termId]);
  return (
    <><PageHeader crumbs={[{ label: 'My children', to: '/parent' }, { label: child ? fullName(child) : '…' }, { label: 'Results' }]} title="Report card" actions={child && <Select className="!w-auto" value={termId} onChange={(e) => nav(`/parent/children/${id}/results/${e.target.value}`)}>{child.publishedTerms.map((t: any) => <option key={t.id} value={t.id}>{t.session_name} · {t.name}</option>)}</Select>} />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{q.data && <ReportCard data={q.data} />}</QueryBoundary></>
  );
}

export function ChildAttendancePage() {
  const { id } = useParams();
  const kids = useQuery(() => api.get<any[]>('/api/portal/parent/children'), []);
  const child = kids.data?.find((c) => String(c.id) === id);
  const q = useQuery(() => api.get<any>(`/api/portal/parent/children/${id}/attendance`), [id]);
  const s = q.data ? Object.fromEntries(q.data.summary.map((a: any) => [a.status, a.c])) : {};
  return (
    <><PageHeader crumbs={[{ label: 'My children', to: '/parent' }, { label: child ? fullName(child) : '…' }, { label: 'Attendance' }]} title="Attendance" />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{q.data && <><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{['present', 'absent', 'late', 'excused'].map((k) => <StatCard key={k} label={k[0].toUpperCase() + k.slice(1)} value={s[k] ?? 0} />)}</div>
        <div className="card mt-6 p-0"><DataTable rows={q.data.recent as any[]} mobileTitle={(r) => fmtDate(r.date)} empty={<EmptyState title="No attendance recorded yet" />} columns={[{ key: 'date', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} /></div></>}</QueryBoundary></>
  );
}
