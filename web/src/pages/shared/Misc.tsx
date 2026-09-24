import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuery, useAction, fmtDateTime, titleCase, useDebounce } from '@/lib/hooks';
import { useClasses, useSubjects, useTeachers, className, fullName, type Paged } from '@/lib/shared';
import { Alert, Badge, Button, ConfirmDialog, DataTable, EmptyState, FileUpload, FormField, Input, Modal, PageHeader, Pagination, QueryBoundary, Select, Textarea, useToast } from '@/components/ui';

// ---------------- Announcements ----------------
export function AnnouncementsPage() {
  const { me } = useAuth(); const toast = useToast();
  const q = useQuery(() => api.get<any[]>('/api/announcements'), []);
  const canManage = me?.permissions.includes('announcements.manage');
  const [open, setOpen] = useState(false); const [del, setDel] = useState<number | null>(null);
  const blank = { title: '', content: '', audience: 'all', expiresAt: '' };
  const [f, setF] = useState(blank);
  const create = useAction(async () => { await api.post('/api/announcements', { ...f, expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null }); setOpen(false); setF(blank); q.reload(); toast('Announcement published'); });
  const remove = useAction(async () => { await api.del(`/api/announcements/${del}`); setDel(null); q.reload(); toast('Deleted'); });
  return (
    <>
      <PageHeader title="Announcements" description={canManage ? 'Publish notices to everyone, or only teachers, students or parents.' : 'Notices from your school.'} actions={canManage && <Button onClick={() => setOpen(true)}>New announcement</Button>} />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        {!q.data?.length ? <EmptyState title="No announcements" description={canManage ? 'Publish your first notice.' : 'Nothing has been posted yet.'} /> :
          <div className="space-y-3">{q.data.map((a) => <article key={a.id} className="card p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{a.title}</h2><p className="mt-0.5 text-xs text-slate-500">{fmtDateTime(a.publish_at)} · {a.author ?? 'School'} · <Badge>{titleCase(a.audience)}</Badge>{a.expires_at && <> · expires {fmtDateTime(a.expires_at)}</>}</p></div>{canManage && <Button size="sm" variant="ghost" onClick={() => setDel(a.id)}>Delete</Button>}</div><p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{a.content}</p></article>)}</div>}
      </QueryBoundary>
      <Modal open={open} onClose={() => setOpen(false)} title="New announcement" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.pending} onClick={() => create.run()}>Publish</Button></>}>
        <div className="space-y-4">{create.error && <Alert tone="error">{create.error}</Alert>}
          <FormField label="Title" required error={create.fields.title}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></FormField>
          <FormField label="Message" required error={create.fields.content}><Textarea value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-3"><FormField label="Audience"><Select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="all">Everyone</option><option value="teachers">Teachers</option><option value="students">Students</option><option value="parents">Parents</option></Select></FormField><FormField label="Expires (optional)"><Input type="datetime-local" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></FormField></div></div></Modal>
      <ConfirmDialog open={del !== null} onClose={() => setDel(null)} danger pending={remove.pending} title="Delete announcement?" message="It will disappear for everyone." confirmLabel="Delete" onConfirm={() => remove.run()} />
    </>
  );
}

// ---------------- Timetable ----------------
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function TimetableGrid({ entries }: { entries: any[] }) {
  if (!entries.length) return <EmptyState title="No timetable yet" description="Periods will appear here once the school adds them." />;
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => entries.some((e) => e.day_of_week === d));
  return (
    <div className="grid gap-3 md:grid-cols-5">{days.map((d) => <div key={d} className="card p-3"><div className="mb-2 text-xs font-semibold uppercase text-slate-500">{DAYS[d - 1]}</div><ul className="space-y-1.5">{entries.filter((e) => e.day_of_week === d).map((e) => <li key={e.id} className="rounded-md bg-slate-50 px-2 py-1.5 text-sm"><div className="font-medium">{e.subject_name ?? e.label ?? 'Period'}</div><div className="text-xs text-slate-500">{e.start_time}–{e.end_time}{e.teacher_name ? ` · ${e.teacher_name}` : ''}{e.level ? ` · ${e.level} ${e.arm}` : ''}</div></li>)}</ul></div>)}</div>
  );
}
export function AdminTimetablePage() {
  const classes = useClasses(); const subjects = useSubjects(); const teachers = useTeachers(); const toast = useToast();
  const [classId, setClassId] = useState('');
  const q = useQuery(() => classId ? api.get<any[]>(`/api/timetable/class/${classId}`) : Promise.resolve([]), [classId]);
  const [f, setF] = useState({ dayOfWeek: '1', startTime: '08:00', endTime: '08:40', subjectId: '', teacherId: '', label: '' });
  const add = useAction(async () => { await api.post('/api/timetable', { classArmId: Number(classId), dayOfWeek: Number(f.dayOfWeek), startTime: f.startTime, endTime: f.endTime, subjectId: f.subjectId ? Number(f.subjectId) : null, teacherId: f.teacherId ? Number(f.teacherId) : null, label: f.label || undefined }); q.reload(); toast('Period added'); });
  const del = useAction(async (id: number) => { await api.del(`/api/timetable/${id}`); q.reload(); });
  return (
    <>
      <PageHeader title="Timetable" description="Build each class's weekly timetable. Teacher clashes are prevented automatically." />
      <Select className="mb-4 sm:max-w-xs" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Select a class…</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select>
      {classId && <>
        <div className="card mb-4 p-4"><div className="grid gap-2 sm:grid-cols-6">
          <Select value={f.dayOfWeek} onChange={(e) => setF({ ...f, dayOfWeek: e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</Select>
          <Input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /><Input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} />
          <Select value={f.subjectId} onChange={(e) => { const sid = e.target.value; setF({ ...f, subjectId: sid }); }}><option value="">Subject / break</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Select value={f.teacherId} onChange={(e) => setF({ ...f, teacherId: e.target.value })}><option value="">Teacher</option>{teachers.data?.items.map((t) => <option key={t.id} value={t.id}>{fullName(t)}</option>)}</Select>
          <Button loading={add.pending} onClick={() => add.run()}>Add period</Button></div>
          {!f.subjectId && <Input className="mt-2 sm:max-w-xs" placeholder="Label (e.g. Break, Assembly)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />}
          {add.error && <Alert tone="error" className="mt-3">{add.error}</Alert>}</div>
        <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
          {q.data?.length ? <div className="card p-0"><DataTable rows={q.data} mobileTitle={(r) => `${DAYS[r.day_of_week - 1]} ${r.start_time}`} columns={[{ key: 'day', header: 'Day', render: (r) => DAYS[r.day_of_week - 1] }, { key: 'time', header: 'Time', render: (r) => `${r.start_time}–${r.end_time}` }, { key: 'subject_name', header: 'Subject', render: (r) => r.subject_name ?? r.label ?? '—' }, { key: 'teacher_name', header: 'Teacher', render: (r) => r.teacher_name ?? '—' }, { key: 'a', header: '', render: (r) => <Button size="sm" variant="ghost" onClick={() => del.run(r.id)}>Remove</Button> }]} /></div> : <EmptyState title="No periods yet for this class" />}
        </QueryBoundary></>}
    </>
  );
}

// ---------------- Materials / Library ----------------
export function LibraryPage({ manage }: { manage?: boolean }) {
  const { me } = useAuth(); const toast = useToast();
  const classes = useClasses(); const subjects = useSubjects();
  const [filters, setFilters] = useState({ q: '', subjectId: '', classArmId: '', category: '', mine: '' }); const dq = useDebounce(filters.q);
  const q = useQuery(() => api.get<any[]>(`/api/materials?q=${encodeURIComponent(dq)}&subjectId=${filters.subjectId}&classArmId=${filters.classArmId}&category=${filters.category}&mine=${filters.mine}`), [dq, filters.subjectId, filters.classArmId, filters.category, filters.mine]);
  const canManage = manage && me?.permissions.includes('materials.manage');
  const [open, setOpen] = useState(false); const [file, setFile] = useState<File | null>(null); const [del, setDel] = useState<number | null>(null);
  const blank = { title: '', description: '', classArmId: '', subjectId: '', category: 'note', externalUrl: '' };
  const [f, setF] = useState(blank);
  const teacherOv = useQuery(() => me?.user.role === 'TEACHER' ? api.get<any>('/api/portal/teacher/overview') : Promise.resolve(null), [me?.user.role]);
  const create = useAction(async () => { const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.append(k, v)); if (file) fd.append('file', file); await api.upload('/api/materials', fd); setOpen(false); setF(blank); setFile(null); q.reload(); toast('Material added'); });
  const remove = useAction(async () => { await api.del(`/api/materials/${del}`); setDel(null); q.reload(); });
  const teacherPairs: any[] = teacherOv.data?.assignments ?? [];
  const classOptions = me?.user.role === 'TEACHER' ? Array.from(new Map(teacherPairs.map((a) => [a.class_arm_id, { id: a.class_arm_id, level: a.level, arm: a.arm }])).values()) : classes.data ?? [];
  const subjectOptions = me?.user.role === 'TEACHER' ? Array.from(new Map(teacherPairs.filter((a) => !f.classArmId || String(a.class_arm_id) === f.classArmId).map((a) => [a.subject_id, { id: a.subject_id, name: a.subject_name }])).values()) : subjects.data ?? [];
  return (
    <>
      <PageHeader title={manage ? 'Learning materials' : 'Digital library'} description={manage ? 'Upload notes, slides, worksheets and links for your classes. Files are private to your school.' : 'Notes, slides and resources shared by your teachers.'} actions={canManage && <Button onClick={() => setOpen(true)}>Add material</Button>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-5">
        <Input placeholder="Search…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <Select value={filters.subjectId} onChange={(e) => setFilters({ ...filters, subjectId: e.target.value })}><option value="">All subjects</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        {me?.user.role !== 'STUDENT' && me?.user.role !== 'PARENT' && <Select value={filters.classArmId} onChange={(e) => setFilters({ ...filters, classArmId: e.target.value })}><option value="">All classes</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select>}
        <Select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">All types</option>{['note', 'textbook', 'slides', 'video', 'worksheet', 'past_question', 'other'].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select>
        {me?.user.role === 'TEACHER' && <Select value={filters.mine} onChange={(e) => setFilters({ ...filters, mine: e.target.value })}><option value="">Everyone's</option><option value="1">Mine only</option></Select>}
      </div>
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        {!q.data?.length ? <EmptyState title="No materials found" description={canManage ? 'Upload the first resource for your students.' : 'Your teachers have not shared anything matching these filters yet.'} /> :
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{q.data.map((m) => <article key={m.id} className="card flex flex-col p-4"><div className="mb-2 flex items-center justify-between"><Badge tone="brand">{titleCase(m.category)}</Badge><span className="text-xs text-slate-400">{fmtDateTime(m.created_at)}</span></div><h3 className="font-semibold">{m.title}</h3><p className="mt-1 line-clamp-3 flex-1 text-sm text-slate-600">{m.description}</p>
            <p className="mt-2 text-xs text-slate-500">{m.subject_name ?? 'General'}{m.level ? ` · ${m.level} ${m.arm}` : ' · All classes'}{m.teacher_name ? ` · ${m.teacher_name}` : ''}</p>
            <div className="mt-3 flex gap-2">{m.file_id && <a href={`/api/files/${m.file_id}`} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">Open file</Button></a>}{m.external_url && <a href={m.external_url} target="_blank" rel="noreferrer noopener"><Button size="sm" variant="outline">Open link</Button></a>}{canManage && <Button size="sm" variant="ghost" onClick={() => setDel(m.id)}>Delete</Button>}</div></article>)}</div>}
      </QueryBoundary>
      <Modal open={open} onClose={() => setOpen(false)} title="Add learning material" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.pending} onClick={() => create.run()}>Add</Button></>}>
        <div className="space-y-4">{create.error && <Alert tone="error">{create.error}</Alert>}
          <FormField label="Title" required error={create.fields.title}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></FormField>
          <FormField label="Description"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-16" /></FormField>
          <div className="grid grid-cols-3 gap-3"><FormField label="Class"><Select value={f.classArmId} onChange={(e) => setF({ ...f, classArmId: e.target.value })}><option value="">All classes</option>{classOptions.map((c: any) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></FormField><FormField label="Subject"><Select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}><option value="">General</option>{subjectOptions.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormField><FormField label="Type"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['note', 'textbook', 'slides', 'video', 'worksheet', 'past_question', 'other'].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}</Select></FormField></div>
          <FormField label="File"><FileUpload file={file} onFile={setFile} accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.txt" hint="PDF, Office documents or images." /></FormField>
          <FormField label="Or link" error={create.fields.externalUrl}><Input placeholder="https://" value={f.externalUrl} onChange={(e) => setF({ ...f, externalUrl: e.target.value })} /></FormField></div></Modal>
      <ConfirmDialog open={del !== null} onClose={() => setDel(null)} danger pending={remove.pending} title="Delete material?" message="Students will no longer be able to access it." confirmLabel="Delete" onConfirm={() => remove.run()} />
    </>
  );
}

// ---------------- Audit ----------------
export function AuditPage({ platform }: { platform?: boolean }) {
  const [page, setPage] = useState(1); const [action, setAction] = useState(''); const dq = useDebounce(action);
  const q = useQuery(() => api.get<Paged<any>>(`${platform ? '/api/platform/audit' : '/api/audit'}?page=${page}&action=${encodeURIComponent(dq)}`), [page, dq, platform]);
  return (
    <>
      <PageHeader title="Audit log" description="Security-sensitive and administrative actions. Passwords and secrets are never recorded." />
      <Input placeholder="Filter by action (e.g. RESULT, LOGIN)…" value={action} onChange={(e) => { setAction(e.target.value.toUpperCase()); setPage(1); }} className="mb-4 sm:max-w-xs" />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        <div className="card p-0"><DataTable rows={q.data?.items ?? []} mobileTitle={(r) => r.action} empty={<EmptyState title="No audit entries" />}
          columns={[{ key: 'created_at', header: 'When', render: (r) => <span className="whitespace-nowrap text-xs">{fmtDateTime(r.created_at)}</span> }, { key: 'action', header: 'Action', render: (r) => <Badge>{r.action}</Badge> },
            { key: 'actor', header: 'Actor', render: (r) => r.actor ?? r.actor_email ?? <span className="text-slate-400">System</span> }, ...(platform ? [{ key: 'school_name', header: 'School', render: (r: any) => r.school_name ?? '—' }] : []),
            { key: 'entity', header: 'Entity', render: (r) => r.entity_type ? `${r.entity_type} #${r.entity_id ?? ''}` : '—' }, { key: 'metadata', header: 'Details', hideOnMobile: true, render: (r) => <code className="line-clamp-1 max-w-xs text-[11px] text-slate-500">{r.metadata ?? ''}</code> }, { key: 'ip_address', header: 'IP', hideOnMobile: true, render: (r) => r.ip_address ?? '—' }]} /></div>
        {q.data && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onChange={setPage} />}
      </QueryBoundary>
    </>
  );
}
