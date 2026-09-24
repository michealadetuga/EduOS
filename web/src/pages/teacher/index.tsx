import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuery, useAction, fmtDate, fmtDateTime, titleCase } from '@/lib/hooks';
import { fullName } from '@/lib/shared';
import { Alert, Badge, Button, DataTable, EmptyState, FileUpload, FormField, Input, Modal, PageHeader, QueryBoundary, Select, StatCard, StatusBadge, Textarea, useToast } from '@/components/ui';
import { TimetableGrid } from '@/pages/shared/Misc';

export function TeacherDashboard() {
  const { me } = useAuth();
  const q = useQuery(() => api.get<any>('/api/portal/teacher/overview'), []);
  const d = q.data;
  return (
    <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{d && <>
      <PageHeader title={`Welcome, ${me?.user.name.split(' ')[0]}`} description={d.session ? `${d.session.name} · ${d.term?.name ?? 'No current term set'}` : 'No active session — ask your school admin.'} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Class subjects" value={d.assignments.length} hint="assigned to you" />
        <StatCard label="Classes" value={d.classes.length} hint={d.classTeacherOf.length ? `class teacher of ${d.classTeacherOf.map((c: any) => `${c.level} ${c.arm}`).join(', ')}` : 'not a class teacher'} />
        <StatCard label="Sheets pending" value={d.assignments.filter((a: any) => !a.sheet_status || ['DRAFT', 'REJECTED'].includes(a.sheet_status)).length} hint="not yet submitted this term" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">My subjects</h2><Link to="/teacher/results" className="text-sm text-brand-700 hover:underline">Results →</Link></div>
          {d.assignments.length ? <ul className="divide-y text-sm">{d.assignments.map((a: any) => <li key={a.id} className="flex items-center justify-between py-2"><span><span className="font-medium">{a.level} {a.arm}</span> · {a.subject_name} <span className="text-xs text-slate-400">({a.student_count} students)</span></span>{a.sheet_status ? <StatusBadge status={a.sheet_status} /> : <Badge>No sheet</Badge>}</li>)}</ul> : <EmptyState title="No subjects assigned yet" description="Your school admin assigns subjects from each class page." />}</div>
        <div className="space-y-6">
          <div className="card p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Attendance today</h2><Link to="/teacher/attendance" className="text-sm text-brand-700 hover:underline">Mark →</Link></div>
            {d.classTeacherOf.length ? <ul className="text-sm">{d.classTeacherOf.map((c: any) => { const done = d.attendanceToday.find((t: any) => t.class_arm_id === c.id); return <li key={c.id} className="flex justify-between py-1.5"><span>{c.level} {c.arm}</span>{done ? <Badge tone="green">Marked ({done.c})</Badge> : <Badge tone="amber">Not marked</Badge>}</li>; })}</ul> : <p className="text-sm text-slate-500">You are not a class teacher; you can still mark attendance for classes you teach.</p>}</div>
          <div className="card p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Recent assignments</h2><Link to="/teacher/assignments" className="text-sm text-brand-700 hover:underline">All →</Link></div>
            {d.recentAssignments.length ? <ul className="divide-y text-sm">{d.recentAssignments.map((a: any) => <li key={a.id} className="py-2"><Link to={`/teacher/assignments/${a.id}`} className="font-medium hover:text-brand-700">{a.title}</Link><div className="text-xs text-slate-500">{a.level} {a.arm} · {a.subject_name} · {a.submissions} submissions · <StatusBadge status={a.status} /></div></li>)}</ul> : <p className="text-sm text-slate-500">No assignments yet.</p>}</div>
        </div>
      </div>
    </>}</QueryBoundary>
  );
}

export function AttendancePage() {
  const toast = useToast(); const [sp, setSp] = useSearchParams();
  const ov = useQuery(() => api.get<any>('/api/portal/teacher/overview'), []);
  const classId = sp.get('classId') ?? ''; const date = sp.get('date') ?? new Date().toISOString().slice(0, 10);
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); n.set(k, v); setSp(n); };
  useEffect(() => { if (!classId && ov.data?.classes?.length) set('classId', String((ov.data.classTeacherOf[0] ?? ov.data.classes[0]).id)); }, [ov.data]); // eslint-disable-line
  const q = useQuery(() => classId ? api.get<any>(`/api/attendance/class/${classId}?date=${date}`) : Promise.resolve(null), [classId, date]);
  const [marks, setMarks] = useState<Record<number, string>>({});
  useEffect(() => { if (q.data) setMarks(Object.fromEntries(q.data.rows.map((r: any) => [r.student_id, r.status ?? 'present']))); }, [q.data]);
  const save = useAction(async () => { await api.post('/api/attendance/mark', { classArmId: Number(classId), date, entries: Object.entries(marks).map(([id, status]) => ({ studentId: Number(id), status })) }); q.reload(); toast('Attendance saved'); });
  const counts = Object.values(marks).reduce((a: Record<string, number>, s) => ({ ...a, [s]: (a[s] ?? 0) + 1 }), {});
  return (
    <>
      <PageHeader title="Attendance" description="Mark daily attendance for your class. You can re-save to correct mistakes." />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row"><Select className="sm:w-56" value={classId} onChange={(e) => set('classId', e.target.value)}>{!ov.data?.classes.length && <option value="">No classes</option>}{ov.data?.classes.map((c: any) => <option key={c.id} value={c.id}>{c.level} {c.arm}</option>)}</Select><Input type="date" className="sm:w-44" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set('date', e.target.value)} /></div>
      <QueryBoundary loading={q.loading || ov.loading} error={q.error ?? ov.error} onRetry={q.reload}>{q.data && (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="card p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4"><div className="text-sm">{q.data.submitted ? <Badge tone="green">Saved for {fmtDate(date)}</Badge> : <Badge tone="amber">Not yet saved for {fmtDate(date)}</Badge>}<span className="ml-3 text-slate-500">{counts.present ?? 0} present · {counts.absent ?? 0} absent · {counts.late ?? 0} late · {counts.excused ?? 0} excused</span></div>
              <div className="flex gap-2"><Button size="sm" variant="ghost" onClick={() => setMarks(Object.fromEntries(q.data.rows.map((r: any) => [r.student_id, 'present'])))}>All present</Button><Button size="sm" loading={save.pending} disabled={!q.data.rows.length} onClick={() => save.run()}>Save</Button></div></div>
            {save.error && <Alert tone="error" className="m-4">{save.error}</Alert>}
            {!q.data.rows.length ? <EmptyState title="No students enrolled" /> : <ul className="divide-y">{q.data.rows.map((r: any) => <li key={r.student_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"><span className="text-sm font-medium">{fullName(r)} <span className="font-mono text-xs text-slate-400">{r.admission_no}</span></span>
              <div className="flex gap-1">{['present', 'absent', 'late', 'excused'].map((s) => <button key={s} type="button" onClick={() => setMarks({ ...marks, [r.student_id]: s })} className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition ${marks[r.student_id] === s ? (s === 'present' ? 'bg-emerald-600 text-white ring-emerald-600' : s === 'absent' ? 'bg-red-600 text-white ring-red-600' : 'bg-amber-500 text-white ring-amber-500') : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>{titleCase(s)}</button>)}</div></li>)}</ul>}
          </div>
          <div className="card h-fit p-4"><h2 className="mb-2 text-sm font-semibold">Recent days</h2>{q.data.summary.length ? <ul className="space-y-1 text-xs">{q.data.summary.map((s: any) => <li key={s.date} className="flex justify-between"><button className="text-brand-700 hover:underline" onClick={() => set('date', s.date)}>{fmtDate(s.date)}</button><span className="text-slate-500">{s.present}P · {s.absent}A · {s.late}L</span></li>)}</ul> : <p className="text-xs text-slate-500">No attendance saved yet.</p>}</div>
        </div>)}</QueryBoundary>
    </>
  );
}

export function TeacherAssignmentsPage() {
  const nav = useNavigate(); const toast = useToast();
  const q = useQuery(() => api.get<any[]>('/api/assignments'), []);
  const ov = useQuery(() => api.get<any>('/api/portal/teacher/overview'), []);
  const [open, setOpen] = useState(false); const [file, setFile] = useState<File | null>(null);
  const blank = { pair: ':', title: '', description: '', dueAt: '', maxScore: '10', publish: 'true' };
  const [f, setF] = useState(blank);
  const create = useAction(async () => { const [classArmId, subjectId] = f.pair.split(':'); const fd = new FormData(); fd.append('classArmId', classArmId ?? ''); fd.append('subjectId', subjectId ?? ''); fd.append('title', f.title); fd.append('description', f.description); fd.append('dueAt', f.dueAt ? new Date(f.dueAt).toISOString() : ''); fd.append('maxScore', f.maxScore); fd.append('publish', f.publish); if (file) fd.append('file', file); const r = await api.upload<{ id: number }>('/api/assignments', fd); setOpen(false); setF(blank); setFile(null); toast('Assignment created'); nav(`/teacher/assignments/${r.id}`); });
  return (
    <>
      <PageHeader title="Assignments" description="Post homework and grade submissions. Students are notified when you publish." actions={<Button onClick={() => setOpen(true)}>New assignment</Button>} />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        <div className="card p-0"><DataTable rows={q.data ?? []} onRowClick={(r) => nav(`/teacher/assignments/${r.id}`)} mobileTitle={(r) => r.title} empty={<EmptyState title="No assignments yet" action={<Button onClick={() => setOpen(true)}>New assignment</Button>} />}
          columns={[{ key: 'title', header: 'Title', render: (r) => <span className="font-medium">{r.title}</span> }, { key: 'class', header: 'Class', render: (r) => `${r.level} ${r.arm}` }, { key: 'subject_name', header: 'Subject' }, { key: 'due_at', header: 'Due', render: (r) => fmtDateTime(r.due_at) }, { key: 'submission_count', header: 'Submitted', render: (r) => `${r.submission_count ?? 0}${r.graded_count != null ? ` (${r.graded_count} graded)` : ''}` }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} /></div>
      </QueryBoundary>
      <Modal open={open} onClose={() => setOpen(false)} title="New assignment" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button loading={create.pending} onClick={() => create.run()}>Create</Button></>}>
        <div className="space-y-4">{create.error && <Alert tone="error">{create.error}</Alert>}
          <FormField label="Class subject" required><Select value={f.pair} onChange={(e) => setF({ ...f, pair: e.target.value })}><option value=":">Select…</option>{ov.data?.assignments.map((a: any) => <option key={a.id} value={`${a.class_arm_id}:${a.subject_id}`}>{a.level} {a.arm} · {a.subject_name}</option>)}</Select></FormField>
          <FormField label="Title" required error={create.fields.title}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></FormField>
          <FormField label="Instructions"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></FormField>
          <div className="grid grid-cols-3 gap-3"><FormField label="Due"><Input type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></FormField><FormField label="Max score"><Input type="number" min={1} value={f.maxScore} onChange={(e) => setF({ ...f, maxScore: e.target.value })} /></FormField><FormField label="Visibility"><Select value={f.publish} onChange={(e) => setF({ ...f, publish: e.target.value })}><option value="true">Publish now</option><option value="false">Save as draft</option></Select></FormField></div>
          <FormField label="Attachment"><FileUpload file={file} onFile={setFile} /></FormField></div></Modal>
    </>
  );
}

export function TeacherAssignmentDetailPage() {
  const { id } = useParams(); const toast = useToast();
  const q = useQuery(() => api.get<any>(`/api/assignments/${id}`), [id]);
  const [grading, setGrading] = useState<any>(null); const [score, setScore] = useState(''); const [fb, setFb] = useState('');
  const status = useAction(async (s: string) => { await api.post(`/api/assignments/${id}/publish`, { status: s }); q.reload(); toast(s === 'published' ? 'Published' : titleCase(s)); });
  const grade = useAction(async () => { await api.post(`/api/assignments/${id}/grade`, { studentId: grading.student_id, score: Number(score), feedback: fb || undefined }); setGrading(null); q.reload(); toast('Graded'); });
  const a = q.data;
  return (
    <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{a && <>
      <PageHeader crumbs={[{ label: 'Assignments', to: '/teacher/assignments' }, { label: a.title }]} title={<>{a.title} <StatusBadge status={a.status} /></>} description={<>{a.level} {a.arm} · {a.subject_name} · Due {fmtDateTime(a.due_at)} · Max {a.max_score}</>}
        actions={<>{a.status === 'draft' && <Button loading={status.pending} onClick={() => status.run('published')}>Publish</Button>}{a.status === 'published' && <Button variant="outline" loading={status.pending} onClick={() => status.run('closed')}>Close submissions</Button>}{a.status === 'closed' && <Button variant="outline" loading={status.pending} onClick={() => status.run('published')}>Reopen</Button>}</>} />
      {a.description && <div className="card mb-4 whitespace-pre-wrap p-4 text-sm">{a.description}{a.file_id && <div className="mt-2"><a className="text-brand-700 underline" href={`/api/files/${a.file_id}`} target="_blank" rel="noreferrer">Attachment: {a.file_name ?? 'download'}</a></div>}</div>}
      <div className="card p-0"><DataTable rows={a.submissions as any[]} mobileTitle={(r) => fullName(r)} empty={<EmptyState title="No students in this class" />}
        columns={[{ key: 'name', header: 'Student', render: (r) => <span className="font-medium">{fullName(r)}</span> }, { key: 'status', header: 'Status', render: (r) => r.status ? <StatusBadge status={r.status} /> : <Badge>Not submitted</Badge> }, { key: 'submitted_at', header: 'Submitted', render: (r) => fmtDateTime(r.submitted_at) },
          { key: 'work', header: 'Work', render: (r) => <div className="max-w-xs text-xs">{r.body && <p className="line-clamp-2">{r.body}</p>}{r.file_id && <a className="text-brand-700 underline" href={`/api/files/${r.file_id}`} target="_blank" rel="noreferrer">{r.file_name ?? 'file'}</a>}</div> },
          { key: 'score', header: 'Score', render: (r) => r.score != null ? `${r.score}/${a.max_score}` : '—' }, { key: 'x', header: '', render: (r) => r.status ? <Button size="sm" variant="outline" onClick={() => { setGrading(r); setScore(r.score ?? ''); setFb(r.feedback ?? ''); }}>{r.score != null ? 'Regrade' : 'Grade'}</Button> : null }]} /></div>
      {grading && <Modal open onClose={() => setGrading(null)} size="sm" title={`Grade — ${fullName(grading)}`} footer={<><Button variant="outline" onClick={() => setGrading(null)}>Cancel</Button><Button loading={grade.pending} onClick={() => grade.run()}>Save grade</Button></>}>
        <div className="space-y-3">{grade.error && <Alert tone="error">{grade.error}</Alert>}{grading.body && <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{grading.body}</p>}<FormField label={`Score (max ${a.max_score})`}><Input type="number" min={0} max={a.max_score} value={score} onChange={(e) => setScore(e.target.value)} /></FormField><FormField label="Feedback"><Textarea value={fb} onChange={(e) => setFb(e.target.value)} className="min-h-16" /></FormField></div></Modal>}
    </>}</QueryBoundary>
  );
}

export function MyTimetablePage() {
  const q = useQuery(() => api.get<any[]>('/api/timetable/mine'), []);
  return <><PageHeader title="My timetable" description="Your weekly periods across all classes." /><QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{q.data && <TimetableGrid entries={q.data} />}</QueryBoundary></>;
}
