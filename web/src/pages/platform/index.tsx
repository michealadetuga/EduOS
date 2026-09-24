import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useQuery, useAction, fmtDateTime, useDebounce } from '@/lib/hooks';
import { type Paged } from '@/lib/shared';
import { Alert, Badge, Button, DataTable, EmptyState, FormField, Input, Modal, PageHeader, Pagination, QueryBoundary, Select, StatCard, StatusBadge, Textarea, useToast } from '@/components/ui';
export { AuditPage } from '@/pages/shared/Misc';

export function PlatformDashboard() {
  const q = useQuery(() => api.get<any>('/api/platform/dashboard'), []); const nav = useNavigate();
  const d = q.data;
  return (
    <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{d && <>
      <PageHeader title="Platform overview" description="Control plane for all schools on EduOS. Access to any school's data is logged with a reason." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4"><StatCard label="Schools" value={d.totals.schools} hint={`${d.totals.active} active · ${d.totals.suspended} suspended`} /><StatCard label="Pending onboarding" value={d.totals.pending} /><StatCard label="Users" value={d.totals.users} /><StatCard label="Students / teachers" value={`${d.totals.students} / ${d.totals.teachers}`} /></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2"><h2 className="mb-3 font-semibold">Recent registrations</h2><DataTable rows={d.recent as any[]} onRowClick={(r) => nav(`/platform/schools/${r.id}`)} mobileTitle={(r) => r.name} columns={[{ key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> }, { key: 'name', header: 'School', render: (r) => <span className="font-medium">{r.name}</span> }, { key: 'type', header: 'Type' }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }, { key: 'created_at', header: 'Registered', render: (r) => fmtDateTime(r.created_at) }]} /></div>
        <div className="space-y-6"><div className="card p-5"><h2 className="mb-3 font-semibold">Registrations by month</h2><ul className="text-sm">{d.registrationsByMonth.map((m: any) => <li key={m.month} className="flex justify-between py-1"><span>{m.month}</span><span className="font-medium">{m.c}</span></li>)}</ul></div>
          <div className="card p-5"><h2 className="mb-3 font-semibold">Activity (7 days)</h2><ul className="text-xs">{d.activity.map((a: any) => <li key={a.action} className="flex justify-between py-1"><Badge>{a.action}</Badge><span>{a.c}</span></li>)}</ul></div></div>
      </div>
    </>}</QueryBoundary>
  );
}

export function SchoolsPage() {
  const nav = useNavigate(); const [page, setPage] = useState(1); const [qt, setQt] = useState(''); const [status, setStatus] = useState(''); const dq = useDebounce(qt);
  const q = useQuery(() => api.get<Paged<any>>(`/api/platform/schools?page=${page}&q=${encodeURIComponent(dq)}&status=${status}`), [page, dq, status]);
  return (
    <><PageHeader title="Schools" />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row"><Input placeholder="Search name, code or email…" value={qt} onChange={(e) => { setQt(e.target.value); setPage(1); }} className="sm:max-w-xs" /><Select className="sm:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option></Select></div>
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}><div className="card p-0"><DataTable rows={q.data?.items ?? []} onRowClick={(r) => nav(`/platform/schools/${r.id}`)} mobileTitle={(r) => r.name} empty={<EmptyState title="No schools" />}
        columns={[{ key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> }, { key: 'name', header: 'School', render: (r) => <span className="font-medium">{r.name}</span> }, { key: 'email', header: 'Email', hideOnMobile: true }, { key: 'students', header: 'Students' }, { key: 'teachers', header: 'Teachers' }, { key: 'users', header: 'Users' }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }, { key: 'created_at', header: 'Registered', render: (r) => fmtDateTime(r.created_at), hideOnMobile: true }]} /></div>
        {q.data && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onChange={setPage} />}</QueryBoundary></>
  );
}

export function SchoolDetailPage() {
  const { id } = useParams(); const toast = useToast();
  const [reason, setReason] = useState(''); const [data, setData] = useState<any>(null);
  const access = useAction(async () => setData(await api.post(`/api/platform/schools/${id}/access`, { reason })));
  const [st, setSt] = useState<{ status: string } | null>(null); const [stReason, setStReason] = useState('');
  const setStatus = useAction(async () => { await api.post(`/api/platform/schools/${id}/status`, { status: st!.status, reason: stReason }); setSt(null); toast(`School ${st!.status}`); setData(await api.post(`/api/platform/schools/${id}/access`, { reason: `Refresh after status change: ${stReason}` })); });
  if (!data) return (
    <><PageHeader crumbs={[{ label: 'Schools', to: '/platform/schools' }, { label: `School #${id}` }]} title="Support access" description="Viewing a school's data is an audited action. State why you need access." />
      <div className="card max-w-lg p-5 space-y-3">{access.error && <Alert tone="error">{access.error}</Alert>}<FormField label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Ticket #123 — admin cannot publish results" /></FormField><Button loading={access.pending} disabled={reason.trim().length < 5} onClick={() => access.run()}>Open school (logged)</Button></div></>
  );
  const s = data.school;
  return (
    <><PageHeader crumbs={[{ label: 'Schools', to: '/platform/schools' }, { label: s.name }]} title={<>{s.name} <StatusBadge status={s.status} /></>} description={<><span className="font-mono">{s.code}</span> · {s.type} · {s.email} · {s.address}</>}
      actions={s.status === 'suspended' ? <Button onClick={() => setSt({ status: 'active' })}>Reactivate</Button> : <Button variant="danger" onClick={() => setSt({ status: 'suspended' })}>Suspend</Button>} />
      <Alert tone="info" className="mb-4">This access was recorded in the audit log with your reason.</Alert>
      <div className="grid grid-cols-3 gap-4"><StatCard label="Students" value={data.counts.students} /><StatCard label="Teachers" value={data.counts.teachers} /><StatCard label="Classes" value={data.counts.classes} /></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5"><h2 className="mb-3 font-semibold">Administrators</h2><ul className="divide-y text-sm">{data.admins.map((a: any) => <li key={a.id} className="py-2"><div className="font-medium">{a.first_name} {a.last_name}</div><div className="text-xs text-slate-500">{a.email} · <StatusBadge status={a.status} /> · {a.email_verified ? 'verified' : 'unverified'} · last login {fmtDateTime(a.last_login_at)}</div></li>)}</ul></div>
        <div className="card p-5"><h2 className="mb-3 font-semibold">Recent activity</h2><ul className="text-xs">{data.recentAudit.map((a: any, i: number) => <li key={i} className="flex justify-between py-1"><Badge>{a.action}</Badge><span className="text-slate-500">{fmtDateTime(a.created_at)}</span></li>)}</ul></div>
        <div className="card p-5"><h2 className="mb-3 font-semibold">Support access history</h2><ul className="divide-y text-xs">{data.accessHistory.map((h: any, i: number) => <li key={i} className="py-1.5"><div>{h.reason}</div><div className="text-slate-500">{h.email} · {fmtDateTime(h.created_at)}</div></li>)}</ul></div>
      </div>
      {st && <Modal open onClose={() => setSt(null)} size="sm" title={st.status === 'suspended' ? 'Suspend school' : 'Reactivate school'} footer={<><Button variant="outline" onClick={() => setSt(null)}>Cancel</Button><Button variant={st.status === 'suspended' ? 'danger' : 'primary'} disabled={stReason.trim().length < 3} loading={setStatus.pending} onClick={() => setStatus.run()}>Confirm</Button></>}>
        <div className="space-y-3">{setStatus.error && <Alert tone="error">{setStatus.error}</Alert>}{st.status === 'suspended' && <Alert tone="warning">All users of this school will be signed out immediately and unable to log in.</Alert>}<FormField label="Reason" required><Textarea value={stReason} onChange={(e) => setStReason(e.target.value)} /></FormField></div></Modal>}
    </>
  );
}
