import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuery, useAction, fmtDateTime } from '@/lib/hooks';
import { useClasses, useCurrent, useSubjects, className, fullName } from '@/lib/shared';
import { Alert, Badge, Button, DataTable, EmptyState, FormField, Input, Modal, PageHeader, QueryBoundary, Select, StatusBadge, Textarea, useToast } from '@/components/ui';

const base = (role?: string) => (role === 'TEACHER' ? '/teacher' : '/admin');

export function ResultsListPage() {
  const { me } = useAuth(); const nav = useNavigate(); const [sp, setSp] = useSearchParams();
  const cur = useCurrent(); const classes = useClasses(); const subjects = useSubjects();
  const f = { termId: sp.get('termId') ?? '', classArmId: sp.get('classArmId') ?? '', subjectId: sp.get('subjectId') ?? '', status: sp.get('status') ?? '' };
  useEffect(() => { if (cur.data?.term && !sp.get('termId')) { const n = new URLSearchParams(sp); n.set('termId', String(cur.data.term.id)); setSp(n, { replace: true }); } }, [cur.data]); // eslint-disable-line
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n); };
  const q = useQuery(() => api.get<any[]>(`/api/results/sheets?termId=${f.termId}&classArmId=${f.classArmId}&subjectId=${f.subjectId}&status=${f.status}`), [f.termId, f.classArmId, f.subjectId, f.status]);
  const [open, setOpen] = useState(false); const [o, setO] = useState({ classArmId: '', subjectId: '' });
  const teacherOv = useQuery(() => me?.user.role === 'TEACHER' ? api.get<any>('/api/portal/teacher/overview') : Promise.resolve(null), [me?.user.role]);
  const openSheet = useAction(async () => { const s = await api.post<any>('/api/results/sheets/open', { termId: Number(f.termId), classArmId: Number(o.classArmId), subjectId: Number(o.subjectId) }); nav(`${base(me?.user.role)}/results/${s.id}`); });
  const isTeacher = me?.user.role === 'TEACHER';
  const openable = isTeacher ? (teacherOv.data?.assignments ?? []) : [];
  return (
    <>
      <PageHeader title="Results" description={isTeacher ? 'Enter scores for your subjects, then submit for approval.' : 'Review submitted sheets, approve, and publish so students and parents can see them.'} actions={isTeacher && <Button onClick={() => setOpen(true)} disabled={!f.termId}>Open result sheet</Button>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-4">
        <Select value={f.termId} onChange={(e) => set('termId', e.target.value)}>{cur.data?.terms.map((t: any) => <option key={t.id} value={t.id}>{cur.data?.session?.name} · {t.name}</option>)}</Select>
        <Select value={f.classArmId} onChange={(e) => set('classArmId', e.target.value)}><option value="">All classes</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{className(c)}</option>)}</Select>
        <Select value={f.subjectId} onChange={(e) => set('subjectId', e.target.value)}><option value="">All subjects</option>{subjects.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        <Select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="">Any status</option>{['DRAFT', 'SUBMITTED', 'REJECTED', 'APPROVED', 'PUBLISHED'].map((s) => <option key={s}>{s}</option>)}</Select>
      </div>
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>
        <div className="card p-0"><DataTable rows={q.data ?? []} onRowClick={(r) => nav(`${base(me?.user.role)}/results/${r.id}`)} mobileTitle={(r) => `${r.level} ${r.arm} · ${r.subject_name}`}
          empty={<EmptyState title="No result sheets" description={isTeacher ? 'Open a sheet for one of your class subjects to start entering scores.' : 'Sheets appear here as teachers open and submit them.'} action={isTeacher && <Button onClick={() => setOpen(true)}>Open result sheet</Button>} />}
          columns={[{ key: 'class', header: 'Class', render: (r) => <span className="font-medium">{r.level} {r.arm}</span> }, { key: 'subject_name', header: 'Subject' }, { key: 'teacher_name', header: 'Teacher', render: (r) => r.teacher_name ?? '—' },
            { key: 'progress', header: 'Scored', render: (r) => <>{r.scored_count}/{r.student_count}</> }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }, { key: 'updated_at', header: 'Updated', render: (r) => fmtDateTime(r.updated_at), hideOnMobile: true }]} /></div>
      </QueryBoundary>
      <Modal open={open} onClose={() => setOpen(false)} title="Open result sheet" size="sm" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!o.classArmId || !o.subjectId} loading={openSheet.pending} onClick={() => openSheet.run()}>Open</Button></>}>
        <div className="space-y-3">{openSheet.error && <Alert tone="error">{openSheet.error}</Alert>}
          <FormField label="Class subject"><Select value={`${o.classArmId}:${o.subjectId}`} onChange={(e) => { const [c, s] = e.target.value.split(':'); setO({ classArmId: c ?? '', subjectId: s ?? '' }); }}><option value=":">Select…</option>{openable.map((a: any) => <option key={a.id} value={`${a.class_arm_id}:${a.subject_id}`}>{a.level} {a.arm} · {a.subject_name}{a.sheet_status ? ` (${a.sheet_status})` : ''}</option>)}</Select></FormField>
          <p className="text-xs text-slate-500">Only subjects assigned to you in the active session are listed.</p></div></Modal>
    </>
  );
}

export function ResultSheetPage() {
  const { id } = useParams(); const { me } = useAuth(); const toast = useToast(); const nav = useNavigate();
  const q = useQuery(() => api.get<any>(`/api/results/sheets/${id}`), [id]);
  const [rows, setRows] = useState<any[]>([]); const [dirty, setDirty] = useState(false); const [note, setNote] = useState(''); const [rejectOpen, setRejectOpen] = useState(false);
  useEffect(() => { if (q.data) { setRows(q.data.rows.map((r: any) => ({ ...r }))); setDirty(false); } }, [q.data]);
  const s = q.data; const scale = s?.scale;
  const editable = s && ['DRAFT', 'REJECTED'].includes(s.status) && me?.permissions.includes('results.enter');
  const upd = (sid: number, k: string, v: string) => { setRows((rs) => rs.map((r) => r.student_id === sid ? { ...r, [k]: v === '' ? null : k === 'teacherComment' || k === 'teacher_comment' ? v : Number(v) } : r)); setDirty(true); };
  const save = useAction(async () => { const d = await api.put<any>(`/api/results/sheets/${id}/scores`, { entries: rows.map((r) => ({ studentId: r.student_id, ca1: r.ca1, ca2: r.ca2, exam: r.exam, teacherComment: r.teacher_comment ?? null })) }); q.setData(d); toast('Scores saved'); });
  const transition = useAction(async (action: string, body?: any) => { const d = await api.post<any>(`/api/results/sheets/${id}/${action}`, body); q.setData(d); setRejectOpen(false); toast({ submit: 'Submitted for approval', approve: 'Approved', reject: 'Returned to teacher', publish: 'Published — students and parents can now see it', reopen: 'Reopened' }[action] ?? 'Done'); });
  const preview = useMemo(() => rows.map((r) => { const complete = r.ca1 != null && r.ca2 != null && r.exam != null; const total = complete ? Number(r.ca1) + Number(r.ca2) + Number(r.exam) : null; const band = total !== null && scale ? [...scale.bands].sort((a: any, b: any) => b.min - a.min).find((b: any) => total >= b.min) : null; return { ...r, total, grade: band?.grade ?? null }; }), [rows, scale]);
  const stats = useMemo(() => { const t = preview.filter((r) => r.total !== null).map((r) => r.total as number); return { scored: t.length, avg: t.length ? (t.reduce((a, b) => a + b, 0) / t.length).toFixed(1) : '—', max: t.length ? Math.max(...t) : '—', min: t.length ? Math.min(...t) : '—' }; }, [preview]);
  const isAdmin = me?.user.role === 'SCHOOL_ADMIN';
  return (
    <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{s && <>
      <PageHeader crumbs={[{ label: 'Results', to: `${base(me?.user.role)}/results` }, { label: `${s.level} ${s.arm} · ${s.subject_name}` }]} title={<>{s.level} {s.arm} · {s.subject_name} <StatusBadge status={s.status} /></>} description={<>{s.session_name} · {s.term_name} · Teacher: {s.teacher_name ?? '—'} · Max CA1 {scale.ca1Max}, CA2 {scale.ca2Max}, Exam {scale.examMax}</>}
        actions={<>
          {editable && <Button variant="outline" disabled={!dirty} loading={save.pending} onClick={() => save.run()}>Save scores</Button>}
          {editable && me?.permissions.includes('results.submit') && <Button disabled={dirty} loading={transition.pending} onClick={() => transition.run('submit')}>Submit for approval</Button>}
          {isAdmin && ['SUBMITTED', 'REVIEW'].includes(s.status) && <><Button variant="outline" onClick={() => setRejectOpen(true)}>Reject</Button><Button loading={transition.pending} onClick={() => transition.run('approve')}>Approve</Button></>}
          {isAdmin && s.status === 'APPROVED' && <><Button variant="outline" onClick={() => setRejectOpen(true)}>Reject</Button><Button loading={transition.pending} onClick={() => transition.run('publish')}>Publish</Button></>}
          {isAdmin && s.status === 'PUBLISHED' && <Button variant="outline" loading={transition.pending} onClick={() => transition.run('reopen')}>Unpublish (reopen)</Button>}
        </>} />
      {s.review_note && s.status === 'REJECTED' && <Alert tone="warning" title="Returned for correction" className="mb-4">{s.review_note}</Alert>}
      {save.error && <Alert tone="error" className="mb-4">{save.error}</Alert>}{transition.error && <Alert tone="error" className="mb-4">{transition.error}</Alert>}
      {dirty && <Alert tone="info" className="mb-4">You have unsaved changes. Save before submitting.</Alert>}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Students', rows.length], ['Scored', stats.scored], ['Average', stats.avg], ['Highest / lowest', `${stats.max} / ${stats.min}`]].map(([l, v]) => <div key={l as string} className="card p-3"><div className="text-[11px] uppercase text-slate-500">{l}</div><div className="text-lg font-semibold">{v}</div></div>)}</div>
      {!rows.length ? <EmptyState title="No students enrolled in this class" description="Enroll students into the class first." /> :
      <div className="card p-0"><div className="table-wrap"><table className="table"><thead><tr><th>#</th><th>Student</th><th className="w-24">CA1 /{scale.ca1Max}</th><th className="w-24">CA2 /{scale.ca2Max}</th><th className="w-24">Exam /{scale.examMax}</th><th>Total</th><th>Grade</th><th className="min-w-48">Comment</th></tr></thead>
        <tbody>{preview.map((r, i) => <tr key={r.student_id}><td className="text-slate-400">{i + 1}</td><td><div className="font-medium">{fullName(r)}</div><div className="font-mono text-[11px] text-slate-400">{r.admission_no}</div></td>
          {(['ca1', 'ca2', 'exam'] as const).map((k) => <td key={k}>{editable ? <Input type="number" min={0} max={scale[`${k}Max`]} step="0.5" className="!h-8 !px-2 text-center" value={r[k] ?? ''} onChange={(e) => upd(r.student_id, k, e.target.value)} /> : (r[k] ?? '—')}</td>)}
          <td className="font-semibold">{r.total ?? '—'}</td><td>{r.grade ? <Badge tone={r.grade.startsWith('A') || r.grade.startsWith('B') ? 'green' : r.grade.startsWith('F') ? 'red' : 'gray'}>{r.grade}</Badge> : '—'}</td>
          <td>{editable ? <Input className="!h-8 !px-2" value={r.teacher_comment ?? ''} onChange={(e) => upd(r.student_id, 'teacher_comment', e.target.value)} placeholder="Optional" /> : (r.teacher_comment ?? '—')}</td></tr>)}</tbody></table></div></div>}
      <p className="mt-3 text-xs text-slate-500">Workflow: Draft → Submitted → Approved → Published. {isAdmin ? 'Open a student to view or print their report card.' : 'Once submitted, scores lock until the admin approves or returns the sheet.'}</p>
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Return sheet to teacher" size="sm" footer={<><Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button><Button variant="danger" disabled={note.trim().length < 3} loading={transition.pending} onClick={() => transition.run('reject', { note })}>Reject</Button></>}>
        <FormField label="Reason (shown to the teacher)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></FormField></Modal>
      {isAdmin && s.status !== 'DRAFT' && <div className="mt-6 text-sm"><span className="text-slate-500">Report cards for this class: </span>{rows.slice(0, 40).map((r) => <Link key={r.student_id} className="mr-3 text-brand-700 hover:underline" to={`/admin/report-card/${r.student_id}/${s.term_id}`} onClick={(e) => { e.preventDefault(); nav(`/admin/report-card/${r.student_id}/${s.term_id}`); }}>{r.last_name}</Link>)}</div>}
    </>}</QueryBoundary>
  );
}

/** Report card used by admin/teacher (full) and student/parent (published only). */
export function ReportCard({ data, onSaveComments }: { data: any; onSaveComments?: (c: { classTeacherComment?: string; adminComment?: string }) => Promise<void> }) {
  const [ct, setCt] = useState(data.comments?.class_teacher_comment ?? ''); const [ad, setAd] = useState(data.comments?.admin_comment ?? '');
  const { me } = useAuth();
  const att = Object.fromEntries((data.attendance ?? []).map((a: any) => [a.status, a.c]));
  const save = useAction(async () => onSaveComments?.({ classTeacherComment: ct, adminComment: ad }));
  return (
    <div className="card mx-auto max-w-3xl p-6 print:border-0 print:shadow-none sm:p-8" id="report-card">
      <div className="flex items-start justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">{data.school?.logo_key && <img src={`/api/logo/${me?.school?.id}`} alt="" className="h-14 w-14 object-contain" />}<div><h2 className="text-lg font-semibold">{data.school?.name}</h2><p className="text-xs text-slate-500">{data.school?.address}<br />{data.school?.phone} · {data.school?.email}</p></div></div>
        <div className="text-right text-sm"><div className="font-semibold">Terminal Report</div><div className="text-slate-500">{data.session} · {data.term}</div></div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 py-4 text-sm sm:grid-cols-4">{[['Student', data.student.name], ['Admission no.', data.student.admissionNo], ['Class', data.class], ['Gender', data.student.gender ?? '—']].map(([k, v]) => <div key={k as string}><dt className="text-xs uppercase text-slate-400">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>
      {!data.subjects.length ? <Alert tone="info">No {data.publishedOnly ? 'published ' : ''}results for this term yet.</Alert> :
        <div className="table-wrap"><table className="table"><thead><tr><th>Subject</th><th className="text-center">CA1</th><th className="text-center">CA2</th><th className="text-center">Exam</th><th className="text-center">Total</th><th className="text-center">Grade</th><th className="text-center">Pos.</th><th className="text-center">Class avg</th><th>Remark</th>{!data.publishedOnly && <th>Status</th>}</tr></thead>
          <tbody>{data.subjects.map((s: any) => <tr key={s.subject}><td className="font-medium">{s.subject}</td><td className="text-center">{s.ca1 ?? '—'}</td><td className="text-center">{s.ca2 ?? '—'}</td><td className="text-center">{s.exam ?? '—'}</td><td className="text-center font-semibold">{s.total ?? '—'}</td><td className="text-center">{s.grade ?? '—'}</td><td className="text-center">{s.total != null ? s.position : '—'}</td><td className="text-center">{s.class_average ?? '—'}</td><td className="text-xs">{s.teacher_comment ?? s.remark ?? ''}</td>{!data.publishedOnly && <td><StatusBadge status={s.status} /></td>}</tr>)}</tbody></table></div>}
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[['Subjects', data.subjectCount], ['Total', data.totalScore], ['Average', data.average ?? '—'], ['Attendance', `${att.present ?? 0} present · ${att.absent ?? 0} absent · ${att.late ?? 0} late`]].map(([k, v]) => <div key={k as string} className="rounded-lg bg-slate-50 p-3"><div className="text-[11px] uppercase text-slate-500">{k}</div><div className="font-semibold">{v}</div></div>)}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Class teacher's comment</div>{onSaveComments && me?.user.role !== 'PARENT' && me?.user.role !== 'STUDENT' ? <Textarea value={ct} onChange={(e) => setCt(e.target.value)} className="min-h-16" /> : <p className="min-h-10 rounded-lg border p-2 text-sm">{data.comments?.class_teacher_comment || '—'}</p>}</div>
        <div><div className="mb-1 text-xs font-semibold uppercase text-slate-500">Principal / Admin comment</div>{onSaveComments && me?.user.role === 'SCHOOL_ADMIN' ? <Textarea value={ad} onChange={(e) => setAd(e.target.value)} className="min-h-16" /> : <p className="min-h-10 rounded-lg border p-2 text-sm">{data.comments?.admin_comment || '—'}</p>}</div>
      </div>
      {onSaveComments && <div className="mt-3 flex gap-2 print:hidden"><Button size="sm" variant="outline" loading={save.pending} onClick={() => save.run()}>Save comments</Button><Button size="sm" variant="ghost" onClick={() => window.print()}>Print</Button></div>}
      {!onSaveComments && <div className="mt-3 print:hidden"><Button size="sm" variant="ghost" onClick={() => window.print()}>Print</Button></div>}
    </div>
  );
}

export function AdminReportCardPage() {
  const { studentId, termId } = useParams(); const toast = useToast();
  const cur = useCurrent();
  const q = useQuery(() => api.get<any>(`/api/results/report-card/${studentId}/${termId}`), [studentId, termId]);
  const nav = useNavigate();
  return (
    <>
      <PageHeader crumbs={[{ label: 'Students', to: '/admin/students' }, { label: q.data?.student.name ?? '…' }, { label: 'Report card' }]} title="Report card" actions={cur.data && <Select className="!w-auto" value={termId} onChange={(e) => nav(`/admin/report-card/${studentId}/${e.target.value}`)}>{cur.data.terms.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>} />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{q.data && <ReportCard data={q.data} onSaveComments={async (c) => { await api.put(`/api/results/report-card/${studentId}/${termId}/comments`, c); toast('Comments saved'); }} />}</QueryBoundary>
    </>
  );
}
