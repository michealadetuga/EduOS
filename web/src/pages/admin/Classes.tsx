import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useQuery, useAction } from '@/lib/hooks';
import { useClasses, useSubjects, useTeachers, className, fullName } from '@/lib/shared';
import { Alert, Button, Checkbox, DataTable, EmptyState, FormField, Input, Modal, PageHeader, QueryBoundary, Select, StatusBadge, useToast } from '@/components/ui';

const LEVELS = ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'];

function ClassForm({ initial, onSaved, onClose }: { initial?: any; onSaved: () => void; onClose: () => void }) {
  const teachers = useTeachers();
  const [f, setF] = useState({ level: initial?.level ?? 'JSS1', arm: initial?.arm ?? 'A', capacity: initial?.capacity ?? '', classTeacherId: initial?.class_teacher_id ?? '', status: initial?.status ?? 'active' });
  const save = useAction(async () => {
    const body: any = { level: f.level, arm: f.arm, capacity: f.capacity ? Number(f.capacity) : null, classTeacherId: f.classTeacherId ? Number(f.classTeacherId) : null };
    if (initial) { body.status = f.status; await api.patch(`/api/classes/${initial.id}`, body); } else await api.post('/api/classes', body);
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit class' : 'New class'} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={save.pending} onClick={() => save.run()}>Save</Button></>}>
      <div className="space-y-4">{save.error && <Alert tone="error">{save.error}</Alert>}
        <div className="grid grid-cols-2 gap-3"><FormField label="Level" required error={save.fields.level}><Select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</Select></FormField>
          <FormField label="Arm" required error={save.fields.arm} hint="e.g. A, B, Science, Art"><Input value={f.arm} onChange={(e) => setF({ ...f, arm: e.target.value })} /></FormField></div>
        <div className="grid grid-cols-2 gap-3"><FormField label="Capacity"><Input type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></FormField>
          <FormField label="Class teacher"><Select value={f.classTeacherId} onChange={(e) => setF({ ...f, classTeacherId: e.target.value })}><option value="">— None —</option>{teachers.data?.items.map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}</Select></FormField></div>
        {initial && <FormField label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="archived">Archived</option></Select></FormField>}</div>
    </Modal>
  );
}

export function ClassesPage() {
  const [showAll, setShowAll] = useState(false);
  const q = useClasses(showAll); const nav = useNavigate();
  const [modal, setModal] = useState<null | 'new' | any>(null);
  return (
    <>
      <PageHeader title="Classes & arms" description="Classes belong to an academic session. Archived classes keep their enrollment history." actions={<Button onClick={() => setModal('new')}>New class</Button>} />
      <div className="mb-3"><Checkbox label="Show classes from all sessions" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /></div>
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        <div className="card p-0">
          <DataTable rows={q.data ?? []} onRowClick={(r) => nav(`/admin/classes/${r.id}`)} mobileTitle={(r) => className(r)}
            empty={<EmptyState title="No classes yet" description="Create JSS1–SS3 classes with arms such as A, B, Science, Art or Commercial." action={<Button onClick={() => setModal('new')}>Create class</Button>} />}
            columns={[
              { key: 'name', header: 'Class', render: (r) => <span className="font-medium">{className(r)}</span> },
              { key: 'session_name', header: 'Session' },
              { key: 'class_teacher_name', header: 'Class teacher', render: (r) => r.class_teacher_name ?? <span className="text-slate-400">Unassigned</span> },
              { key: 'student_count', header: 'Students', render: (r) => <>{r.student_count}{r.capacity ? <span className="text-slate-400"> / {r.capacity}</span> : ''}</> },
              { key: 'subject_count', header: 'Subjects' },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'a', header: '', render: (r) => <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setModal(r); }}>Edit</Button> },
            ]} />
        </div>
      </QueryBoundary>
      {modal && <ClassForm initial={modal === 'new' ? undefined : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); q.reload(); }} />}
    </>
  );
}

export function ClassDetailPage() {
  const { id } = useParams(); const toast = useToast();
  const q = useQuery(() => api.get<any>(`/api/classes/${id}`), [id]);
  const subjects = useSubjects(); const teachers = useTeachers();
  const [assign, setAssign] = useState({ subjectId: '', teacherId: '' });
  const add = useAction(async () => { await api.post(`/api/classes/${id}/subjects`, { subjectId: Number(assign.subjectId), teacherId: assign.teacherId ? Number(assign.teacherId) : null }); setAssign({ subjectId: '', teacherId: '' }); q.reload(); toast('Subject assigned'); });
  const remove = useAction(async (sid: number) => { await api.del(`/api/classes/${id}/subjects/${sid}`); q.reload(); });
  const c = q.data;
  return (
    <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
      {c && <>
        <PageHeader crumbs={[{ label: 'Classes', to: '/admin/classes' }, { label: className(c) }]} title={className(c)} description={<>{c.session_name} · Class teacher: {c.class_teacher_name ?? 'unassigned'} · <StatusBadge status={c.status} /></>} actions={<Link to={`/admin/students/promote?from=${c.id}`}><Button variant="outline">Promote / move students</Button></Link>} />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Subjects & teachers</h2>
            {add.error && <Alert tone="error" className="mb-3">{add.error}</Alert>}
            <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Select value={assign.subjectId} onChange={(e) => setAssign({ ...assign, subjectId: e.target.value })}><option value="">Select subject…</option>{subjects.data?.filter((s) => !c.subjects.some((x: any) => x.subject_id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              <Select value={assign.teacherId} onChange={(e) => setAssign({ ...assign, teacherId: e.target.value })}><option value="">Teacher (optional)</option>{teachers.data?.items.map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}</Select>
              <Button disabled={!assign.subjectId} loading={add.pending} onClick={() => add.run()}>Add</Button>
            </div>
            {c.subjects.length ? <ul className="divide-y text-sm">{c.subjects.map((s: any) => <li key={s.id} className="flex items-center justify-between py-2"><span><span className="font-medium">{s.subject_name}</span> <span className="text-slate-500">· {s.teacher_name ?? 'no teacher'}</span></span>
              <div className="flex gap-2"><Select className="!h-8 !w-auto !py-0 text-xs" value={s.teacher_id ?? ''} onChange={async (e) => { await api.post(`/api/classes/${id}/subjects`, { subjectId: s.subject_id, teacherId: e.target.value ? Number(e.target.value) : null }); q.reload(); }}><option value="">Unassigned</option>{teachers.data?.items.map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}</Select><Button size="sm" variant="ghost" onClick={() => remove.run(s.subject_id)}>Remove</Button></div></li>)}</ul>
              : <p className="text-sm text-slate-500">No subjects assigned yet.</p>}
          </div>
          <div className="card p-5">
            <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Students ({c.students.length})</h2><Link to={`/admin/students?classId=${c.id}`} className="text-sm text-brand-700 hover:underline">Open in students</Link></div>
            {c.students.length ? <ul className="divide-y text-sm">{c.students.map((s: any) => <li key={s.id} className="flex items-center justify-between py-2"><Link to={`/admin/students/${s.id}`} className="hover:text-brand-700">{fullName(s)}</Link><span className="font-mono text-xs text-slate-500">{s.admission_no}</span></li>)}</ul> : <p className="text-sm text-slate-500">No students enrolled. Add students and assign them to this class.</p>}
          </div>
        </div>
      </>}
    </QueryBoundary>
  );
}
