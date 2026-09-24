import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useQuery, useAction, useDebounce, fmtDate, titleCase } from '@/lib/hooks';
import { useClasses, className, fullName, type Paged } from '@/lib/shared';
import { Alert, Badge, Button, Checkbox, ConfirmDialog, DataTable, EmptyState, FormField, Input, Modal, PageHeader, Pagination, QueryBoundary, Select, StatusBadge, useToast } from '@/components/ui';

function InviteNotice({ url }: { url?: string }) {
  if (!url) return null;
  return <Alert tone="info" className="mt-3"><p className="font-medium">Development mode</p><p className="mt-1 break-all text-xs">The activation email was written to the local outbox. Link: <a className="underline" href={url}>{url}</a></p></Alert>;
}

// ---------------- Teachers ----------------
export function TeachersPage() {
  const nav = useNavigate(); const toast = useToast();
  const [page, setPage] = useState(1); const [qText, setQ] = useState(''); const [status, setStatus] = useState(''); const dq = useDebounce(qText);
  const q = useQuery(() => api.get<Paged<any>>(`/api/teachers?page=${page}&q=${encodeURIComponent(dq)}&status=${status}`), [page, dq, status]);
  const [open, setOpen] = useState(false); const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', employmentStatus: 'full_time', createAccount: true });
  const [invite, setInvite] = useState<string | undefined>();
  const create = useAction(async () => { const r = await api.post<{ id: number; inviteUrl?: string }>('/api/teachers', f); q.reload(); toast('Teacher added'); if (r.inviteUrl) setInvite(r.inviteUrl); else setOpen(false); setF({ firstName: '', lastName: '', email: '', phone: '', employmentStatus: 'full_time', createAccount: true }); });
  return (
    <>
      <PageHeader title="Teachers" description="Teachers receive an activation email and only see classes and subjects assigned to them." actions={<Button onClick={() => { setInvite(undefined); setOpen(true); }}>Add teacher</Button>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row"><Input placeholder="Search name or email…" value={qText} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="sm:max-w-xs" /><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="sm:w-44"><option value="">All statuses</option><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="inactive">Inactive</option></Select></div>
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        <div className="card p-0"><DataTable rows={q.data?.items ?? []} onRowClick={(r) => nav(`/admin/teachers/${r.id}`)} mobileTitle={(r) => fullName(r)}
          empty={<EmptyState title="No teachers yet" description="Add your teaching staff. Each teacher gets their own login." action={<Button onClick={() => setOpen(true)}>Add teacher</Button>} />}
          columns={[{ key: 'name', header: 'Name', render: (r) => <span className="font-medium">{fullName(r)}</span> }, { key: 'email', header: 'Email' }, { key: 'phone', header: 'Phone', hideOnMobile: true },
            { key: 'assignment_count', header: 'Assignments' }, { key: 'employment_status', header: 'Status', render: (r) => <StatusBadge status={r.employment_status} /> },
            { key: 'account_status', header: 'Account', render: (r) => r.account_status ? <Badge tone={r.email_verified ? 'green' : 'amber'}>{r.email_verified ? 'Active' : 'Invited'}</Badge> : <Badge>No account</Badge> }]} /></div>
        {q.data && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onChange={setPage} />}
      </QueryBoundary>
      <Modal open={open} onClose={() => setOpen(false)} title="Add teacher" footer={invite ? <Button onClick={() => setOpen(false)}>Done</Button> : <><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.pending} onClick={() => create.run()}>Add teacher</Button></>}>
        {invite ? <><Alert tone="success">Teacher added. An activation link has been emailed.</Alert><InviteNotice url={invite} /></> :
          <div className="space-y-4">{create.error && <Alert tone="error">{create.error}</Alert>}
            <div className="grid grid-cols-2 gap-3"><FormField label="First name" required error={create.fields.firstName}><Input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></FormField><FormField label="Last name" required error={create.fields.lastName}><Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></FormField></div>
            <FormField label="Email" required error={create.fields.email}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></FormField>
            <div className="grid grid-cols-2 gap-3"><FormField label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></FormField><FormField label="Employment"><Select value={f.employmentStatus} onChange={(e) => setF({ ...f, employmentStatus: e.target.value })}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option></Select></FormField></div>
            <Checkbox label="Create a login account and send activation email" checked={f.createAccount} onChange={(e) => setF({ ...f, createAccount: e.target.checked })} /></div>}
      </Modal>
    </>
  );
}

export function TeacherDetailPage() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast();
  const q = useQuery(() => api.get<any>(`/api/teachers/${id}`), [id]);
  const [edit, setEdit] = useState<any>(null); const [confirm, setConfirm] = useState(false); const [invite, setInvite] = useState<string | undefined>();
  const save = useAction(async () => { await api.patch(`/api/teachers/${id}`, edit); setEdit(null); q.reload(); toast('Saved'); });
  const deactivate = useAction(async () => { await api.del(`/api/teachers/${id}`); setConfirm(false); toast('Teacher deactivated'); nav('/admin/teachers'); });
  const resend = useAction(async () => { const r = await api.post<{ message: string; inviteUrl?: string }>(`/api/teachers/${id}/resend-invite`); toast(r.message); setInvite(r.inviteUrl); });
  const t = q.data;
  return (
    <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{t && <>
      <PageHeader crumbs={[{ label: 'Teachers', to: '/admin/teachers' }, { label: fullName(t) }]} title={fullName(t)} description={<>{t.email} · {t.phone || 'no phone'} · <StatusBadge status={t.employment_status} /></>}
        actions={<><Button variant="outline" loading={resend.pending} onClick={() => resend.run()}>{t.user_id ? 'Send password link' : 'Create account'}</Button><Button variant="outline" onClick={() => setEdit({ firstName: t.first_name, lastName: t.last_name, phone: t.phone ?? '', employmentStatus: t.employment_status })}>Edit</Button>{t.employment_status !== 'inactive' && <Button variant="danger" onClick={() => setConfirm(true)}>Deactivate</Button>}</>} />
      <InviteNotice url={invite} />
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="card p-5"><h2 className="mb-3 font-semibold">Teaching assignments</h2>{t.assignments.length ? <ul className="divide-y text-sm">{t.assignments.map((a: any) => <li key={a.id} className="flex justify-between py-2"><span><Link className="font-medium hover:text-brand-700" to={`/admin/classes/${a.class_arm_id}`}>{a.level} {a.arm}</Link> · {a.subject_name}</span><span className="text-xs text-slate-500">{a.session_name}</span></li>)}</ul> : <p className="text-sm text-slate-500">Not assigned to any subject yet. Assign from a class page.</p>}</div>
        <div className="card p-5"><h2 className="mb-3 font-semibold">Class teacher of</h2>{t.classTeacherOf.length ? <ul className="text-sm">{t.classTeacherOf.map((c: any) => <li key={c.id}><Link className="hover:text-brand-700" to={`/admin/classes/${c.id}`}>{c.level} {c.arm}</Link></li>)}</ul> : <p className="text-sm text-slate-500">None.</p>}</div>
      </div>
      {edit && <Modal open onClose={() => setEdit(null)} title="Edit teacher" footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.pending} onClick={() => save.run()}>Save</Button></>}>
        <div className="space-y-4">{save.error && <Alert tone="error">{save.error}</Alert>}<div className="grid grid-cols-2 gap-3"><FormField label="First name"><Input value={edit.firstName} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} /></FormField><FormField label="Last name"><Input value={edit.lastName} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} /></FormField></div>
          <FormField label="Phone"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></FormField><FormField label="Employment status"><Select value={edit.employmentStatus} onChange={(e) => setEdit({ ...edit, employmentStatus: e.target.value })}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="inactive">Inactive</option></Select></FormField></div></Modal>}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} danger pending={deactivate.pending} title="Deactivate teacher?" message="Their login will be disabled immediately. Historical results and attendance are kept." confirmLabel="Deactivate" onConfirm={() => deactivate.run()} />
    </>}</QueryBoundary>
  );
}

// ---------------- Students ----------------
export function StudentsPage() {
  const nav = useNavigate(); const toast = useToast(); const [sp, setSp] = useSearchParams();
  const classes = useClasses();
  const filters = { q: sp.get('q') ?? '', classId: sp.get('classId') ?? '', gender: sp.get('gender') ?? '', status: sp.get('status') ?? 'active', page: Number(sp.get('page') ?? 1) };
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'page') n.delete('page'); setSp(n); };
  const dq = useDebounce(filters.q);
  const q = useQuery(() => api.get<Paged<any>>(`/api/students?page=${filters.page}&q=${encodeURIComponent(dq)}&classId=${filters.classId}&gender=${filters.gender}&status=${filters.status}`), [filters.page, dq, filters.classId, filters.gender, filters.status]);
  const [open, setOpen] = useState(false); const [invite, setInvite] = useState<string | undefined>();
  const blank = { firstName: '', lastName: '', gender: '', dateOfBirth: '', admissionNo: '', classArmId: '', email: '', createAccount: false };
  const [f, setF] = useState<any>(blank);
  const create = useAction(async () => {
    const r = await api.post<{ id: number; admissionNo: string; inviteUrl?: string }>('/api/students', { ...f, gender: f.gender || null, dateOfBirth: f.dateOfBirth || null, admissionNo: f.admissionNo || undefined, classArmId: f.classArmId ? Number(f.classArmId) : null, email: f.email || null });
    q.reload(); toast(`Student added (${r.admissionNo})`); setF(blank); if (r.inviteUrl) setInvite(r.inviteUrl); else setOpen(false);
  });
  return (
    <>
      <PageHeader title="Students" description="Students are enrolled in a class per academic session; history is preserved on promotion." actions={<><Link to="/admin/students/import"><Button variant="outline">Import CSV</Button></Link><Button onClick={() => { setInvite(undefined); setOpen(true); }}>Add student</Button></>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Input placeholder="Search name or admission no…" value={filters.q} onChange={(e) => set('q', e.target.value)} />
        <Select value={filters.classId} onChange={(e) => set('classId', e.target.value)}><option value="">All classes</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select>
        <Select value={filters.gender} onChange={(e) => set('gender', e.target.value)}><option value="">Any gender</option><option value="male">Male</option><option value="female">Female</option></Select>
        <Select value={filters.status} onChange={(e) => set('status', e.target.value)}><option value="active">Active</option><option value="graduated">Graduated</option><option value="archived">Archived</option><option value="">All</option></Select>
      </div>
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        <div className="card p-0"><DataTable rows={q.data?.items ?? []} onRowClick={(r) => nav(`/admin/students/${r.id}`)} mobileTitle={(r) => fullName(r)}
          empty={<EmptyState title="No students found" description="Add students individually or import a CSV file." action={<div className="flex gap-2"><Link to="/admin/students/import"><Button variant="outline">Import CSV</Button></Link><Button onClick={() => setOpen(true)}>Add student</Button></div>} />}
          columns={[{ key: 'admission_no', header: 'Admission no.', render: (r) => <span className="font-mono text-xs">{r.admission_no}</span> }, { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{fullName(r)}</span> },
            { key: 'class', header: 'Class', render: (r) => r.level ? className(r) : <span className="text-slate-400">Unassigned</span> }, { key: 'gender', header: 'Gender', render: (r) => titleCase(r.gender) || '—' },
            { key: 'parent_names', header: 'Parent(s)', hideOnMobile: true, render: (r) => r.parent_names ?? <span className="text-slate-400">None</span> }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} /></div>
        {q.data && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onChange={(p) => set('page', String(p))} />}
      </QueryBoundary>
      <Modal open={open} onClose={() => setOpen(false)} title="Add student" footer={invite ? <Button onClick={() => setOpen(false)}>Done</Button> : <><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.pending} onClick={() => create.run()}>Add student</Button></>}>
        {invite ? <><Alert tone="success">Student added and login invitation sent.</Alert><InviteNotice url={invite} /></> :
          <div className="space-y-4">{create.error && <Alert tone="error">{create.error}</Alert>}
            <div className="grid grid-cols-2 gap-3"><FormField label="First name" required error={create.fields.firstName}><Input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></FormField><FormField label="Last name" required error={create.fields.lastName}><Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></FormField></div>
            <div className="grid grid-cols-2 gap-3"><FormField label="Gender"><Select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">—</option><option value="male">Male</option><option value="female">Female</option></Select></FormField><FormField label="Date of birth"><Input type="date" value={f.dateOfBirth} onChange={(e) => setF({ ...f, dateOfBirth: e.target.value })} /></FormField></div>
            <div className="grid grid-cols-2 gap-3"><FormField label="Admission number" hint="Leave blank to auto-generate"><Input value={f.admissionNo} onChange={(e) => setF({ ...f, admissionNo: e.target.value })} /></FormField><FormField label="Class"><Select value={f.classArmId} onChange={(e) => setF({ ...f, classArmId: e.target.value })}><option value="">Assign later</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></FormField></div>
            <FormField label="Student email" hint="Needed for a student login" error={create.fields.email}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></FormField>
            <Checkbox label="Create student login and send activation email" checked={f.createAccount} disabled={!f.email} onChange={(e) => setF({ ...f, createAccount: e.target.checked })} /></div>}
      </Modal>
    </>
  );
}

export function StudentDetailPage() {
  const { id } = useParams(); const nav = useNavigate(); const toast = useToast();
  const q = useQuery(() => api.get<any>(`/api/students/${id}`), [id]);
  const cur = useQuery(() => api.get<any>('/api/academics/current'), []);
  const classes = useClasses();
  const [edit, setEdit] = useState<any>(null); const [confirm, setConfirm] = useState(false); const [linkOpen, setLinkOpen] = useState(false); const [acct, setAcct] = useState<string | null>(null); const [invite, setInvite] = useState<string | undefined>();
  const parents = useQuery(() => linkOpen ? api.get<Paged<any>>('/api/parents?pageSize=100') : Promise.resolve(null), [linkOpen]);
  const [parentId, setParentId] = useState(''); const [rel, setRel] = useState('');
  const save = useAction(async () => { await api.patch(`/api/students/${id}`, { ...edit, gender: edit.gender || null, dateOfBirth: edit.dateOfBirth || null, classArmId: edit.classArmId ? Number(edit.classArmId) : undefined }); setEdit(null); q.reload(); toast('Saved'); });
  const archive = useAction(async () => { await api.del(`/api/students/${id}`); setConfirm(false); toast('Student archived'); nav('/admin/students'); });
  const link = useAction(async () => { await api.post(`/api/students/${id}/parents`, { parentId: Number(parentId), relationship: rel || undefined }); setLinkOpen(false); setParentId(''); q.reload(); toast('Parent linked'); });
  const unlink = useAction(async (pid: number) => { await api.del(`/api/students/${id}/parents/${pid}`); q.reload(); });
  const createAcct = useAction(async () => { const r = await api.post<{ inviteUrl?: string }>(`/api/students/${id}/account`, { email: acct }); setAcct(null); setInvite(r.inviteUrl); q.reload(); toast('Account created and invitation sent'); });
  const s = q.data;
  return (
    <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{s && <>
      <PageHeader crumbs={[{ label: 'Students', to: '/admin/students' }, { label: fullName(s) }]} title={fullName(s)} description={<><span className="font-mono">{s.admission_no}</span> · {s.level ? className(s) : 'No class this session'} · {titleCase(s.gender) || 'gender unspecified'} · <StatusBadge status={s.status} /></>}
        actions={<>{cur.data?.term && <Link to={`/admin/report-card/${s.id}/${cur.data.term.id}`}><Button variant="outline">Report card</Button></Link>}<Button variant="outline" onClick={() => setEdit({ firstName: s.first_name, lastName: s.last_name, gender: s.gender ?? '', dateOfBirth: s.date_of_birth ?? '', admissionNo: s.admission_no, classArmId: s.class_arm_id ?? '', status: s.status })}>Edit</Button>{s.status === 'active' && <Button variant="danger" onClick={() => setConfirm(true)}>Archive</Button>}</>} />
      <InviteNotice url={invite} />
      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <div className="card p-5"><h2 className="mb-3 font-semibold">Profile</h2><dl className="space-y-2 text-sm">{[['Date of birth', fmtDate(s.date_of_birth)], ['Admitted', fmtDate(s.admission_date)], ['Login', s.account_status ? `${s.account_email} (${s.account_status})` : 'No account']].map(([k, v]) => <div key={k as string} className="flex justify-between gap-3"><dt className="text-slate-500">{k}</dt><dd className="text-right">{v}</dd></div>)}</dl>
          {!s.user_id && (acct === null ? <Button size="sm" variant="outline" className="mt-3" onClick={() => setAcct('')}>Create student login</Button> : <div className="mt-3 space-y-2"><Input type="email" placeholder="student@email.com" value={acct} onChange={(e) => setAcct(e.target.value)} />{createAcct.error && <p className="text-xs text-red-600">{createAcct.error}</p>}<div className="flex gap-2"><Button size="sm" loading={createAcct.pending} onClick={() => createAcct.run()}>Send invite</Button><Button size="sm" variant="ghost" onClick={() => setAcct(null)}>Cancel</Button></div></div>)}
          <h2 className="mb-2 mt-5 font-semibold">Attendance</h2><div className="flex flex-wrap gap-2">{s.attendanceSummary.length ? s.attendanceSummary.map((a: any) => <Badge key={a.status} tone={a.status === 'present' ? 'green' : a.status === 'absent' ? 'red' : 'amber'}>{a.c} {a.status}</Badge>) : <span className="text-sm text-slate-500">No records yet</span>}</div></div>
        <div className="card p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Parents / guardians</h2><Button size="sm" variant="outline" onClick={() => setLinkOpen(true)}>Link parent</Button></div>
          {s.parents.length ? <ul className="divide-y text-sm">{s.parents.map((p: any) => <li key={p.id} className="flex items-center justify-between py-2"><div><Link to={`/admin/parents/${p.id}`} className="font-medium hover:text-brand-700">{fullName(p)}</Link><div className="text-xs text-slate-500">{p.relationship ?? 'Guardian'} · {p.phone ?? p.email ?? ''}</div></div><Button size="sm" variant="ghost" onClick={() => unlink.run(p.id)}>Unlink</Button></li>)}</ul> : <p className="text-sm text-slate-500">No parent linked. Parents only see children linked here.</p>}</div>
        <div className="card p-5"><h2 className="mb-3 font-semibold">Enrollment history</h2><ul className="divide-y text-sm">{s.enrollments.map((e: any) => <li key={e.id} className="flex items-center justify-between py-2"><span>{e.session_name} · <span className="font-medium">{e.level} {e.arm}</span></span>{e.outcome && <Badge>{titleCase(e.outcome)}</Badge>}</li>)}</ul></div>
      </div>
      {edit && <Modal open onClose={() => setEdit(null)} title="Edit student" footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.pending} onClick={() => save.run()}>Save</Button></>}>
        <div className="space-y-4">{save.error && <Alert tone="error">{save.error}</Alert>}
          <div className="grid grid-cols-2 gap-3"><FormField label="First name"><Input value={edit.firstName} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} /></FormField><FormField label="Last name"><Input value={edit.lastName} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} /></FormField></div>
          <div className="grid grid-cols-2 gap-3"><FormField label="Gender"><Select value={edit.gender} onChange={(e) => setEdit({ ...edit, gender: e.target.value })}><option value="">—</option><option value="male">Male</option><option value="female">Female</option></Select></FormField><FormField label="Date of birth"><Input type="date" value={edit.dateOfBirth} onChange={(e) => setEdit({ ...edit, dateOfBirth: e.target.value })} /></FormField></div>
          <div className="grid grid-cols-2 gap-3"><FormField label="Admission number" error={save.fields.admissionNo}><Input value={edit.admissionNo} onChange={(e) => setEdit({ ...edit, admissionNo: e.target.value })} /></FormField><FormField label="Class (current session)"><Select value={edit.classArmId} onChange={(e) => setEdit({ ...edit, classArmId: e.target.value })}><option value="">Unchanged / none</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></FormField></div>
          <FormField label="Status"><Select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="graduated">Graduated</option><option value="archived">Archived</option></Select></FormField></div></Modal>}
      <Modal open={linkOpen} onClose={() => setLinkOpen(false)} title="Link parent / guardian" size="sm" footer={<><Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button><Button disabled={!parentId} loading={link.pending} onClick={() => link.run()}>Link</Button></>}>
        <div className="space-y-3">{link.error && <Alert tone="error">{link.error}</Alert>}<FormField label="Parent"><Select value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="">Select…</option>{parents.data?.items.map((p) => <option key={p.id} value={p.id}>{fullName(p)} {p.phone ? `· ${p.phone}` : ''}</option>)}</Select></FormField><FormField label="Relationship"><Input placeholder="Mother, Father, Guardian…" value={rel} onChange={(e) => setRel(e.target.value)} /></FormField><p className="text-xs text-slate-500">Can't find them? <Link className="text-brand-700 underline" to="/admin/parents">Create the parent first</Link>.</p></div></Modal>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} danger pending={archive.pending} title="Archive student?" message="The student will be hidden from active lists and their login disabled. Records are preserved." confirmLabel="Archive" onConfirm={() => archive.run()} />
    </>}</QueryBoundary>
  );
}

export function StudentImportPage() {
  const nav = useNavigate(); const toast = useToast();
  const [csv, setCsv] = useState(''); const [preview, setPreview] = useState<any>(null);
  const pv = useAction(async () => setPreview(await api.post('/api/students/import/preview', { csv })));
  const imp = useAction(async () => { const r = await api.post<{ created: number }>('/api/students/import', { csv }); toast(`${r.created} students imported`); nav('/admin/students'); });
  const template = 'first_name,last_name,gender,admission_no,date_of_birth,class,parent_email\nAda,Lovelace,female,,2011-03-14,JSS1 A,\nGrace,Hopper,female,GFS/26/0042,2010-12-09,SS1 Science,parent@example.com';
  return (
    <>
      <PageHeader crumbs={[{ label: 'Students', to: '/admin/students' }, { label: 'Import' }]} title="Import students from CSV" description="Upload or paste a CSV. Every row is validated first; nothing is saved until all rows pass." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2"><input type="file" accept=".csv,text/csv" className="text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then((t) => { setCsv(t); setPreview(null); }); }} /><Button size="sm" variant="ghost" onClick={() => { setCsv(template); setPreview(null); }}>Use example</Button><a className="text-sm text-brand-700 hover:underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`} download="eduos-students-template.csv">Download template</a></div>
            <textarea className="input min-h-48 font-mono text-xs" placeholder="first_name,last_name,gender,admission_no,date_of_birth,class,parent_email" value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} />
            <div className="mt-3 flex gap-2"><Button variant="outline" disabled={!csv.trim()} loading={pv.pending} onClick={() => pv.run()}>Validate</Button><Button disabled={!preview || preview.errors.length > 0} loading={imp.pending} onClick={() => imp.run()}>Import {preview && !preview.errors.length ? `${preview.total} students` : ''}</Button></div>
            {pv.error && <Alert tone="error" className="mt-3">{pv.error}</Alert>}{imp.error && <Alert tone="error" className="mt-3">{imp.error}</Alert>}
          </div>
          {preview && <div className="card p-5">
            {preview.errors.length ? <Alert tone="error" title={`${preview.errors.length} problem${preview.errors.length === 1 ? '' : 's'} found`}><ul className="mt-2 max-h-56 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">{preview.errors.map((e: any, i: number) => <li key={i}>Row {e.row}{e.field ? ` · ${e.field}` : ''}: {e.message}</li>)}</ul></Alert> : <Alert tone="success">All {preview.total} rows are valid and ready to import.</Alert>}
            {preview.warnings?.map((w: any, i: number) => <Alert key={i} tone="warning" className="mt-2">{w.message}</Alert>)}
            <div className="mt-4 table-wrap max-h-80"><table className="table"><thead><tr><th>#</th><th>Name</th><th>Gender</th><th>Admission no.</th><th>Class</th><th>Parent</th></tr></thead><tbody>{preview.rows.slice(0, 200).map((r: any, i: number) => <tr key={i}><td className="text-slate-400">{i + 2}</td><td>{r.first_name} {r.last_name}</td><td>{r.gender ?? '—'}</td><td className="font-mono text-xs">{r.admission_no ?? <span className="text-slate-400">auto</span>}</td><td>{r.class ?? '—'}</td><td>{r.parent_email ?? '—'}</td></tr>)}</tbody></table></div>
          </div>}
        </div>
        <div className="card h-fit p-5 text-sm"><h2 className="mb-2 font-semibold">Format</h2><ul className="list-disc space-y-1 pl-5 text-slate-600"><li><code>first_name</code>, <code>last_name</code> required</li><li><code>gender</code>: male or female</li><li><code>admission_no</code>: blank to auto-generate; must be unique in your school</li><li><code>date_of_birth</code>: YYYY-MM-DD</li><li><code>class</code>: e.g. "JSS1 A" or "SS2 Science" — must exist in the active session</li><li><code>parent_email</code>: must match an existing parent</li></ul><p className="mt-3 text-xs text-slate-500">Up to 5,000 rows per file.</p></div>
      </div>
    </>
  );
}

export function PromotePage() {
  const [sp] = useSearchParams(); const nav = useNavigate(); const toast = useToast();
  const sessions = useQuery(() => api.get<any[]>('/api/academics/sessions'), []);
  const all = useClasses(true);
  const [from, setFrom] = useState(sp.get('from') ?? ''); const [toSession, setToSession] = useState(''); const [defaultTo, setDefaultTo] = useState('');
  const cls = useQuery(() => from ? api.get<any>(`/api/classes/${from}`) : Promise.resolve(null), [from]);
  const [moves, setMoves] = useState<Record<number, { toClassArmId: string; outcome: string }>>({});
  const targetClasses = all.data?.filter((c) => String(c.session_id) === toSession) ?? [];
  const apply = useAction(async () => {
    const list = (cls.data?.students ?? []).map((s: any) => { const m = moves[s.id] ?? { toClassArmId: defaultTo, outcome: 'promoted' }; return { studentId: s.id, toClassArmId: m.toClassArmId ? Number(m.toClassArmId) : null, outcome: m.outcome }; });
    await api.post('/api/students/promote', { fromClassArmId: Number(from), toSessionId: Number(toSession), moves: list });
    toast(`${list.length} students processed`); nav(`/admin/classes/${from}`);
  });
  return (
    <>
      <PageHeader crumbs={[{ label: 'Students', to: '/admin/students' }, { label: 'Promote' }]} title="Promote / move students" description="Move a whole class into the next session. Previous enrollments are kept as history." />
      <div className="card mb-4 grid gap-3 p-5 sm:grid-cols-3">
        <FormField label="From class"><Select value={from} onChange={(e) => { setFrom(e.target.value); setMoves({}); }}><option value="">Select…</option>{all.data?.map((c) => <option key={c.id} value={c.id}>{className(c)} · {c.session_name}</option>)}</Select></FormField>
        <FormField label="Into session"><Select value={toSession} onChange={(e) => { setToSession(e.target.value); setDefaultTo(''); setMoves({}); }}><option value="">Select…</option>{sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}</Select></FormField>
        <FormField label="Default destination class"><Select value={defaultTo} onChange={(e) => setDefaultTo(e.target.value)} disabled={!toSession}><option value="">— none (graduate/transfer) —</option>{targetClasses.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></FormField>
      </div>
      {apply.error && <Alert tone="error" className="mb-4">{apply.error}</Alert>}
      {cls.data && toSession && <div className="card p-0"><div className="table-wrap"><table className="table"><thead><tr><th>Student</th><th>Outcome</th><th>Destination</th></tr></thead><tbody>{cls.data.students.map((s: any) => { const m = moves[s.id] ?? { toClassArmId: defaultTo, outcome: 'promoted' }; const setM = (p: Partial<typeof m>) => setMoves({ ...moves, [s.id]: { ...m, ...p } }); return (
        <tr key={s.id}><td>{fullName(s)} <span className="font-mono text-xs text-slate-400">{s.admission_no}</span></td>
          <td><Select className="!h-8 !py-0 text-xs" value={m.outcome} onChange={(e) => setM({ outcome: e.target.value, toClassArmId: ['graduated', 'transferred'].includes(e.target.value) ? '' : m.toClassArmId })}><option value="promoted">Promoted</option><option value="repeated">Repeated</option><option value="graduated">Graduated</option><option value="transferred">Transferred</option></Select></td>
          <td><Select className="!h-8 !py-0 text-xs" value={m.toClassArmId} disabled={['graduated', 'transferred'].includes(m.outcome)} onChange={(e) => setM({ toClassArmId: e.target.value })}><option value="">— none —</option>{targetClasses.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select></td></tr>); })}</tbody></table></div>
        <div className="border-t p-4"><Button loading={apply.pending} disabled={!cls.data.students.length} onClick={() => apply.run()}>Apply to {cls.data.students.length} students</Button></div></div>}
      {from && cls.data && !cls.data.students.length && <EmptyState title="No students in this class" />}
    </>
  );
}

// ---------------- Parents ----------------
export function ParentsPage() {
  const nav = useNavigate(); const toast = useToast();
  const [page, setPage] = useState(1); const [qText, setQ] = useState(''); const dq = useDebounce(qText);
  const q = useQuery(() => api.get<Paged<any>>(`/api/parents?page=${page}&q=${encodeURIComponent(dq)}`), [page, dq]);
  const [open, setOpen] = useState(false); const [invite, setInvite] = useState<string | undefined>();
  const blank = { firstName: '', lastName: '', email: '', phone: '', createAccount: false };
  const [f, setF] = useState(blank);
  const create = useAction(async () => { const r = await api.post<{ inviteUrl?: string }>('/api/parents', { ...f, email: f.email || null }); q.reload(); toast('Parent added'); setF(blank); if (r.inviteUrl) setInvite(r.inviteUrl); else setOpen(false); });
  return (
    <>
      <PageHeader title="Parents & guardians" description="One parent can be linked to several children. Parents only ever see their linked children." actions={<Button onClick={() => { setInvite(undefined); setOpen(true); }}>Add parent</Button>} />
      <Input placeholder="Search name, email or phone…" value={qText} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="mb-4 sm:max-w-xs" />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        <div className="card p-0"><DataTable rows={q.data?.items ?? []} onRowClick={(r) => nav(`/admin/parents/${r.id}`)} mobileTitle={(r) => fullName(r)}
          empty={<EmptyState title="No parents yet" description="Add parents, then link them to their children from a student's page." action={<Button onClick={() => setOpen(true)}>Add parent</Button>} />}
          columns={[{ key: 'name', header: 'Name', render: (r) => <span className="font-medium">{fullName(r)}</span> }, { key: 'email', header: 'Email', render: (r) => r.email ?? '—' }, { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
            { key: 'children', header: 'Children', render: (r) => r.children ?? <span className="text-slate-400">None linked</span> }, { key: 'account_status', header: 'Account', render: (r) => r.account_status ? <Badge tone="green">Active</Badge> : <Badge>No login</Badge> }]} /></div>
        {q.data && <Pagination page={q.data.page} totalPages={q.data.totalPages} total={q.data.total} onChange={setPage} />}
      </QueryBoundary>
      <Modal open={open} onClose={() => setOpen(false)} title="Add parent / guardian" footer={invite ? <Button onClick={() => setOpen(false)}>Done</Button> : <><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.pending} onClick={() => create.run()}>Add parent</Button></>}>
        {invite ? <><Alert tone="success">Parent added and login invitation sent.</Alert><InviteNotice url={invite} /></> :
          <div className="space-y-4">{create.error && <Alert tone="error">{create.error}</Alert>}
            <div className="grid grid-cols-2 gap-3"><FormField label="First name" required error={create.fields.firstName}><Input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></FormField><FormField label="Last name" required error={create.fields.lastName}><Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></FormField></div>
            <div className="grid grid-cols-2 gap-3"><FormField label="Email" error={create.fields.email}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></FormField><FormField label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></FormField></div>
            <Checkbox label="Create parent login and send activation email" checked={f.createAccount} disabled={!f.email} onChange={(e) => setF({ ...f, createAccount: e.target.checked })} /></div>}
      </Modal>
    </>
  );
}

export function ParentDetailPage() {
  const { id } = useParams(); const toast = useToast();
  const q = useQuery(() => api.get<any>(`/api/parents/${id}`), [id]);
  const [edit, setEdit] = useState<any>(null); const [invite, setInvite] = useState<string | undefined>();
  const save = useAction(async () => { await api.patch(`/api/parents/${id}`, { ...edit, email: edit.email || null }); setEdit(null); q.reload(); toast('Saved'); });
  const acct = useAction(async () => { const r = await api.post<{ inviteUrl?: string }>(`/api/parents/${id}/account`); setInvite(r.inviteUrl); q.reload(); toast('Invitation sent'); });
  const p = q.data;
  return (
    <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{p && <>
      <PageHeader crumbs={[{ label: 'Parents', to: '/admin/parents' }, { label: fullName(p) }]} title={fullName(p)} description={<>{p.email ?? 'no email'} · {p.phone ?? 'no phone'}</>} actions={<>{!p.user_id && <Button variant="outline" loading={acct.pending} onClick={() => acct.run()}>Create login</Button>}<Button variant="outline" onClick={() => setEdit({ firstName: p.first_name, lastName: p.last_name, email: p.email ?? '', phone: p.phone ?? '' })}>Edit</Button></>} />
      {acct.error && <Alert tone="error">{acct.error}</Alert>}<InviteNotice url={invite} />
      <div className="card mt-4 p-5"><h2 className="mb-3 font-semibold">Linked children</h2>{p.children.length ? <ul className="divide-y text-sm">{p.children.map((c: any) => <li key={c.id} className="flex justify-between py-2"><Link className="font-medium hover:text-brand-700" to={`/admin/students/${c.id}`}>{fullName(c)}</Link><span className="text-xs text-slate-500">{c.relationship ?? 'Guardian'} · {c.admission_no}</span></li>)}</ul> : <p className="text-sm text-slate-500">No children linked. Open a student's page to link this parent.</p>}</div>
      {edit && <Modal open onClose={() => setEdit(null)} title="Edit parent" footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button loading={save.pending} onClick={() => save.run()}>Save</Button></>}><div className="space-y-4">{save.error && <Alert tone="error">{save.error}</Alert>}
        <div className="grid grid-cols-2 gap-3"><FormField label="First name"><Input value={edit.firstName} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} /></FormField><FormField label="Last name"><Input value={edit.lastName} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} /></FormField></div>
        <FormField label="Email"><Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></FormField><FormField label="Phone"><Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></FormField></div></Modal>}
    </>}</QueryBoundary>
  );
}
