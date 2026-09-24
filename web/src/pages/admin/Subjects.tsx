import { useState } from 'react';
import { api } from '@/lib/api';
import { useQuery, useAction, titleCase } from '@/lib/hooks';
import { Alert, Badge, Button, DataTable, EmptyState, FormField, Input, Modal, PageHeader, QueryBoundary, Select, StatusBadge, useToast } from '@/components/ui';

const STARTER = [['Mathematics', 'MTH', 'core'], ['English Language', 'ENG', 'core'], ['Civic Education', 'CIV', 'core'], ['Basic Science', 'BSC', 'core'], ['Basic Technology', 'BTE', 'core'], ['Social Studies', 'SOS', 'core'], ['Computer Studies', 'CMP', 'core'], ['Agricultural Science', 'AGR', 'elective'], ['Physics', 'PHY', 'elective', 'science'], ['Chemistry', 'CHM', 'elective', 'science'], ['Biology', 'BIO', 'elective', 'science'], ['Further Mathematics', 'FMT', 'elective', 'science'], ['Economics', 'ECO', 'elective', 'commercial'], ['Commerce', 'COM', 'elective', 'commercial'], ['Financial Accounting', 'ACC', 'elective', 'commercial'], ['Government', 'GOV', 'elective', 'art'], ['Literature in English', 'LIT', 'elective', 'art'], ['Christian Religious Studies', 'CRS', 'elective', 'art'], ['Islamic Religious Studies', 'IRS', 'elective', 'art'], ['Geography', 'GEO', 'elective', 'science']];

export function SubjectsPage() {
  const q = useQuery(() => api.get<any[]>('/api/subjects'), []); const toast = useToast();
  const [modal, setModal] = useState<null | 'new' | any>(null);
  const [f, setF] = useState({ name: '', code: '', kind: 'core', track: '', status: 'active' });
  const open = (s?: any) => { setF(s ? { name: s.name, code: s.code ?? '', kind: s.kind, track: s.track ?? '', status: s.status } : { name: '', code: '', kind: 'core', track: '', status: 'active' }); setModal(s ?? 'new'); };
  const save = useAction(async () => {
    const body: any = { name: f.name, code: f.code || null, kind: f.kind, track: f.track || null };
    if (modal !== 'new') { body.status = f.status; await api.patch(`/api/subjects/${modal.id}`, body); } else await api.post('/api/subjects', body);
    setModal(null); q.reload(); toast('Subject saved');
  });
  const bulk = useAction(async () => { const r = await api.post<{ created: number }>('/api/subjects/bulk', { subjects: STARTER.map(([name, code, kind, track]) => ({ name, code, kind, track: track ?? null })) }); q.reload(); toast(`${r.created} subjects added`); });
  return (
    <>
      <PageHeader title="Subjects" description="Core and elective subjects. Attach subjects to classes (with a teacher) from each class page." actions={<><Button variant="outline" loading={bulk.pending} onClick={() => bulk.run()}>Add common Nigerian subjects</Button><Button onClick={() => open()}>New subject</Button></>} />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        <div className="card p-0"><DataTable rows={q.data ?? []} mobileTitle={(r) => r.name}
          empty={<EmptyState title="No subjects yet" description="Start with the common subject list or add your own." action={<Button onClick={() => bulk.run()} loading={bulk.pending}>Add common subjects</Button>} />}
          columns={[
            { key: 'name', header: 'Subject', render: (r) => <span className="font-medium">{r.name}</span> }, { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code ?? '—'}</span> },
            { key: 'kind', header: 'Type', render: (r) => <Badge tone={r.kind === 'core' ? 'brand' : 'purple'}>{titleCase(r.kind)}</Badge> }, { key: 'track', header: 'Track', render: (r) => titleCase(r.track) || '—' },
            { key: 'class_count', header: 'Classes' }, { key: 'teacher_count', header: 'Teachers' }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'a', header: '', render: (r) => <Button size="sm" variant="ghost" onClick={() => open(r)}>Edit</Button> },
          ]} /></div>
      </QueryBoundary>
      {modal && <Modal open onClose={() => setModal(null)} title={modal === 'new' ? 'New subject' : 'Edit subject'} footer={<><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button loading={save.pending} onClick={() => save.run()}>Save</Button></>}>
        <div className="space-y-4">{save.error && <Alert tone="error">{save.error}</Alert>}
          <FormField label="Name" required error={save.fields.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></FormField>
          <div className="grid grid-cols-3 gap-3"><FormField label="Code"><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></FormField>
            <FormField label="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="core">Core</option><option value="elective">Elective</option></Select></FormField>
            <FormField label="Track"><Select value={f.track} onChange={(e) => setF({ ...f, track: e.target.value })}><option value="">General</option><option value="science">Science</option><option value="art">Art</option><option value="commercial">Commercial</option></Select></FormField></div>
          {modal !== 'new' && <FormField label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="archived">Archived</option></Select></FormField>}</div></Modal>}
    </>
  );
}
