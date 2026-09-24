import { useState } from 'react';
import { api } from '@/lib/api';
import { useQuery, useAction, fmtDate } from '@/lib/hooks';
import { Alert, Badge, Button, ConfirmDialog, EmptyState, FormField, Input, Modal, PageHeader, QueryBoundary, StatusBadge, useToast } from '@/components/ui';

export function SessionsPage() {
  const q = useQuery(() => api.get<any[]>('/api/academics/sessions'), []);
  const toast = useToast();
  const [open, setOpen] = useState(false); const [f, setF] = useState({ name: '', startDate: '', endDate: '' });
  const [confirm, setConfirm] = useState<{ id: number; action: 'activate' | 'archive' } | null>(null);
  const [termFor, setTermFor] = useState<number | null>(null); const [termName, setTermName] = useState('');
  const create = useAction(async () => { await api.post('/api/academics/sessions', { name: f.name, startDate: f.startDate || null, endDate: f.endDate || null }); setOpen(false); setF({ name: '', startDate: '', endDate: '' }); q.reload(); toast('Session created'); });
  const act = useAction(async (id: number, action: string) => { await api.post(`/api/academics/sessions/${id}/${action}`); setConfirm(null); q.reload(); toast(action === 'activate' ? 'Session activated' : 'Session archived'); });
  const setCurrent = useAction(async (id: number) => { await api.post(`/api/academics/terms/${id}/set-current`); q.reload(); toast('Current term updated'); });
  const addTerm = useAction(async () => { await api.post(`/api/academics/sessions/${termFor}/terms`, { name: termName }); setTermFor(null); setTermName(''); q.reload(); });
  const y = new Date().getFullYear();
  return (
    <>
      <PageHeader title="Academic sessions & terms" description="Only one session is active at a time. Archiving never deletes historical records." actions={<Button onClick={() => setOpen(true)}>New session</Button>} />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        {act.error && <Alert tone="error" className="mb-4">{act.error}</Alert>}
        {setCurrent.error && <Alert tone="error" className="mb-4">{setCurrent.error}</Alert>}
        {!q.data?.length ? <EmptyState title="No academic session yet" description={`Create ${y}/${y + 1} to get started. Three terms are created automatically.`} action={<Button onClick={() => setOpen(true)}>Create session</Button>} /> :
          <div className="space-y-4">{q.data.map((s) => (
            <div key={s.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3"><h2 className="text-lg font-semibold">{s.name}</h2><StatusBadge status={s.status} /><span className="text-xs text-slate-500">{fmtDate(s.start_date)} – {fmtDate(s.end_date)}</span></div>
                <div className="flex gap-2">
                  {s.status !== 'active' && <Button size="sm" variant="outline" onClick={() => setConfirm({ id: s.id, action: 'activate' })}>Activate</Button>}
                  {s.status === 'active' && <Button size="sm" variant="ghost" onClick={() => setConfirm({ id: s.id, action: 'archive' })}>Archive</Button>}
                  <Button size="sm" variant="ghost" onClick={() => setTermFor(s.id)}>Add term</Button>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">{s.terms.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span>{t.name}{!!t.is_current && <Badge tone="brand" className="ml-2">Current</Badge>}</span>{s.status === 'active' && !t.is_current && <button className="text-xs text-brand-700 hover:underline" onClick={() => setCurrent.run(t.id)}>Set current</button>}</div>))}</div>
            </div>))}</div>}
      </QueryBoundary>
      <Modal open={open} onClose={() => setOpen(false)} title="New academic session" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.pending} onClick={() => create.run()}>Create</Button></>}>
        <div className="space-y-4">{create.error && <Alert tone="error">{create.error}</Alert>}
          <FormField label="Session name" required error={create.fields.name} hint="Format: 2026/2027"><Input placeholder={`${y}/${y + 1}`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-3"><FormField label="Start date"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></FormField><FormField label="End date"><Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></FormField></div>
          <p className="text-xs text-slate-500">First, Second and Third Term will be created. If no session is active, this one becomes active.</p></div>
      </Modal>
      <Modal open={termFor !== null} onClose={() => setTermFor(null)} title="Add term" size="sm" footer={<><Button variant="outline" onClick={() => setTermFor(null)}>Cancel</Button><Button loading={addTerm.pending} onClick={() => addTerm.run()}>Add</Button></>}>
        {addTerm.error && <Alert tone="error" className="mb-3">{addTerm.error}</Alert>}<FormField label="Term name"><Input value={termName} onChange={(e) => setTermName(e.target.value)} placeholder="e.g. Summer Term" /></FormField></Modal>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} pending={act.pending} title={confirm?.action === 'activate' ? 'Activate session?' : 'Archive session?'} message={confirm?.action === 'activate' ? 'The currently active session will be archived. Its records remain available.' : 'Teachers will no longer be able to enter results for this session.'} confirmLabel={confirm?.action === 'activate' ? 'Activate' : 'Archive'} danger={confirm?.action === 'archive'} onConfirm={() => confirm && act.run(confirm.id, confirm.action)} />
    </>
  );
}
