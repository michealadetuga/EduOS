import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useQuery, useAction, fmtDate, fmtDateTime, titleCase } from '@/lib/hooks';
import { Alert, Badge, Button, DataTable, EmptyState, FileUpload, FormField, PageHeader, QueryBoundary, Select, StatCard, StatusBadge, Textarea, useToast } from '@/components/ui';
import { ReportCard } from '@/pages/shared/Results';
import { TimetableGrid } from '@/pages/shared/Misc';

export function StudentDashboard() {
  const q = useQuery(() => api.get<any>('/api/portal/student/overview'), []);
  const d = q.data; const att = d ? Object.fromEntries(d.attendance.summary.map((a: any) => [a.status, a.c])) : {};
  const total = Object.values(att).reduce((a: number, b: any) => a + b, 0) as number;
  return (
    <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{d && <>
      <PageHeader title={`Hi, ${d.student.name.split(' ')[0]}`} description={d.enrollment ? `${d.enrollment.level} ${d.enrollment.arm} · ${d.session?.name} · ${d.term?.name ?? ''}` : 'You are not enrolled in a class this session yet — please contact your school.'} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Attendance" value={total ? `${Math.round(((att.present ?? 0) + (att.late ?? 0)) / total * 100)}%` : '—'} hint={`${att.present ?? 0} present · ${att.absent ?? 0} absent`} />
        <StatCard label="Assignments due" value={d.upcoming.filter((u: any) => !u.my_status).length} hint="not yet submitted" />
        <StatCard label="Published results" value={d.publishedTerms.length} hint="terms available" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Upcoming assignments</h2><Link to="/student/assignments" className="text-sm text-brand-700 hover:underline">All →</Link></div>
          {d.upcoming.length ? <ul className="divide-y text-sm">{d.upcoming.map((u: any) => <li key={u.id} className="flex items-center justify-between py-2"><div><Link to={`/student/assignments/${u.id}`} className="font-medium hover:text-brand-700">{u.title}</Link><div className="text-xs text-slate-500">{u.subject_name} · due {fmtDateTime(u.due_at)}</div></div>{u.my_status ? <StatusBadge status={u.my_status} /> : <Badge tone="amber">To do</Badge>}</li>)}</ul> : <p className="text-sm text-slate-500">Nothing due. 🎉</p>}</div>
        <div className="card p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Today's classes</h2><Link to="/student/timetable" className="text-sm text-brand-700 hover:underline">Week →</Link></div>
          {d.timetableToday.length ? <ul className="divide-y text-sm">{d.timetableToday.map((t: any, i: number) => <li key={i} className="flex justify-between py-2"><span className="font-medium">{t.subject_name ?? t.label}</span><span className="text-slate-500">{t.start_time}–{t.end_time}</span></li>)}</ul> : <p className="text-sm text-slate-500">No periods today.</p>}</div>
      </div>
      {d.publishedTerms.length > 0 && <div className="card mt-6 p-5"><h2 className="mb-2 font-semibold">Results</h2><div className="flex flex-wrap gap-2">{d.publishedTerms.map((t: any) => <Link key={t.id} to={`/student/results/${t.id}`}><Button size="sm" variant="outline">{t.session_name} · {t.name}</Button></Link>)}</div></div>}
    </>}</QueryBoundary>
  );
}

export function StudentAssignmentsPage() {
  const nav = useNavigate();
  const q = useQuery(() => api.get<any[]>('/api/assignments'), []);
  return (
    <><PageHeader title="Assignments" description="Homework from your teachers. Submit text or a file before the due date." />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}><div className="card p-0"><DataTable rows={q.data ?? []} onRowClick={(r) => nav(`/student/assignments/${r.id}`)} mobileTitle={(r) => r.title} empty={<EmptyState title="No assignments yet" />}
        columns={[{ key: 'title', header: 'Title', render: (r) => <span className="font-medium">{r.title}</span> }, { key: 'subject_name', header: 'Subject' }, { key: 'teacher_name', header: 'Teacher', hideOnMobile: true }, { key: 'due_at', header: 'Due', render: (r) => fmtDateTime(r.due_at) }, { key: 'my_status', header: 'Status', render: (r) => r.my_status ? <StatusBadge status={r.my_status} /> : <Badge tone="amber">To do</Badge> }, { key: 'my_score', header: 'Score', render: (r) => r.my_score != null ? `${r.my_score}/${r.max_score}` : '—' }]} /></div></QueryBoundary></>
  );
}

export function StudentAssignmentDetailPage() {
  const { id } = useParams(); const toast = useToast();
  const q = useQuery(() => api.get<any>(`/api/assignments/${id}`), [id]);
  const [body, setBody] = useState(''); const [file, setFile] = useState<File | null>(null);
  const submit = useAction(async () => { const fd = new FormData(); fd.append('body', body); if (file) fd.append('file', file); await api.upload(`/api/assignments/${id}/submit`, fd); setFile(null); q.reload(); toast('Submitted'); });
  const a = q.data; const sub = a?.mySubmission;
  const closed = a && (a.status !== 'published');
  return (
    <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{a && <>
      <PageHeader crumbs={[{ label: 'Assignments', to: '/student/assignments' }, { label: a.title }]} title={a.title} description={<>{a.subject_name} · {a.teacher_name} · Due {fmtDateTime(a.due_at)} · Max score {a.max_score}</>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5"><h2 className="mb-2 font-semibold">Instructions</h2><p className="whitespace-pre-wrap text-sm">{a.description || 'No additional instructions.'}</p>{a.file_id && <a className="mt-3 inline-block text-sm text-brand-700 underline" href={`/api/files/${a.file_id}`} target="_blank" rel="noreferrer">Download attachment</a>}</div>
        <div className="card p-5"><h2 className="mb-2 font-semibold">Your submission</h2>
          {sub && <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm"><div className="mb-1 flex items-center justify-between"><StatusBadge status={sub.status} /><span className="text-xs text-slate-500">{fmtDateTime(sub.submitted_at)}</span></div>{sub.body && <p className="whitespace-pre-wrap">{sub.body}</p>}{sub.file_id && <a className="text-brand-700 underline" href={`/api/files/${sub.file_id}`} target="_blank" rel="noreferrer">{sub.file_name}</a>}{sub.score != null && <div className="mt-2 border-t pt-2"><span className="font-semibold">Score: {sub.score}/{a.max_score}</span>{sub.feedback && <p className="mt-1 text-slate-600">{sub.feedback}</p>}</div>}</div>}
          {closed ? <Alert tone="info">Submissions are closed.</Alert> : sub?.status === 'graded' ? <Alert tone="success">This assignment has been graded.</Alert> : <div className="space-y-3">{submit.error && <Alert tone="error">{submit.error}</Alert>}<FormField label="Answer"><Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type your response…" /></FormField><FormField label="Or attach a file"><FileUpload file={file} onFile={setFile} /></FormField><Button loading={submit.pending} onClick={() => submit.run()}>{sub ? 'Resubmit' : 'Submit'}</Button></div>}</div>
      </div>
    </>}</QueryBoundary>
  );
}

export function StudentResultsPage() {
  const { termId } = useParams(); const nav = useNavigate();
  const ov = useQuery(() => api.get<any>('/api/portal/student/overview'), []);
  const tid = termId ?? ov.data?.publishedTerms[0]?.id;
  const q = useQuery(() => tid ? api.get<any>(`/api/portal/student/results/${tid}`) : Promise.resolve(null), [tid]);
  return (
    <><PageHeader title="My results" description="Only results your school has published appear here." actions={ov.data?.publishedTerms.length > 0 && <Select className="!w-auto" value={tid ?? ''} onChange={(e) => nav(`/student/results/${e.target.value}`)}>{ov.data.publishedTerms.map((t: any) => <option key={t.id} value={t.id}>{t.session_name} · {t.name}</option>)}</Select>} />
      <QueryBoundary loading={q.loading || ov.loading} error={q.error ?? ov.error} onRetry={q.reload}>{ov.data && !tid ? <EmptyState title="No results published yet" description="Your report card appears here as soon as your school publishes it." /> : q.data && <ReportCard data={q.data} />}</QueryBoundary></>
  );
}

export function StudentAttendancePage() {
  const q = useQuery(() => api.get<any>('/api/portal/student/attendance'), []);
  const s = q.data ? Object.fromEntries(q.data.summary.map((a: any) => [a.status, a.c])) : {};
  return (
    <><PageHeader title="My attendance" />
      <QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{q.data && <><div className="grid grid-cols-2 gap-4 sm:grid-cols-4">{['present', 'absent', 'late', 'excused'].map((k) => <StatCard key={k} label={titleCase(k)} value={s[k] ?? 0} />)}</div>
        <div className="card mt-6 p-0"><DataTable rows={q.data.recent as any[]} mobileTitle={(r) => fmtDate(r.date)} empty={<EmptyState title="No attendance recorded yet" />} columns={[{ key: 'date', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} /></div></>}</QueryBoundary></>
  );
}

export function StudentTimetablePage() {
  const q = useQuery(() => api.get<any[]>('/api/timetable/mine'), []);
  return <><PageHeader title="Timetable" /><QueryBoundary loading={q.loading} error={q.error} onRetry={q.reload}>{q.data && <TimetableGrid entries={q.data} />}</QueryBoundary></>;
}

export function PastQuestionsPage() {
  const { me } = useAuth(); const toast = useToast();
  const catalog = useQuery(() => api.get<any[]>('/api/past-questions/catalog'), []);
  const attempts = useQuery(() => me?.user.role === 'STUDENT' ? api.get<any[]>('/api/past-questions/attempts') : Promise.resolve([]), []);
  const [sel, setSel] = useState({ exam: '', subject: '' }); const [qs, setQs] = useState<any[] | null>(null); const [ans, setAns] = useState<Record<number, number>>({}); const [result, setResult] = useState<any>(null);
  const exams = Array.from(new Set(catalog.data?.map((c) => c.exam)));
  const subjects = Array.from(new Set(catalog.data?.filter((c) => c.exam === sel.exam).map((c) => c.subject)));
  const start = useAction(async () => { setResult(null); setAns({}); setQs(await api.get(`/api/past-questions/practice?exam=${sel.exam}&subject=${encodeURIComponent(sel.subject)}&limit=20`)); });
  const submit = useAction(async () => { const r = await api.post<any>('/api/past-questions/practice/submit', { exam: sel.exam, subject: sel.subject, answers: Object.entries(ans).map(([id, choice]) => ({ id: Number(id), choice })) }); setResult(r); attempts.reload(); toast(`You scored ${r.percent}%`); });
  const review = result ? new Map(result.review.map((r: any) => [r.id, r])) : null;
  return (
    <>
      <PageHeader title="Past questions" description="Practise WAEC, NECO, BECE and JAMB-style questions. Foundation feature: the bank grows as your school adds questions." />
      <QueryBoundary loading={catalog.loading} error={catalog.error} onRetry={catalog.reload}>
        {!catalog.data?.length ? <EmptyState title="No past questions available yet" description="Your school has not added any questions to the bank." /> : <>
          <div className="card mb-4 flex flex-col gap-2 p-4 sm:flex-row"><Select className="sm:w-40" value={sel.exam} onChange={(e) => setSel({ exam: e.target.value, subject: '' })}><option value="">Exam</option>{exams.map((e) => <option key={e}>{e}</option>)}</Select><Select className="sm:w-56" value={sel.subject} onChange={(e) => setSel({ ...sel, subject: e.target.value })}><option value="">Subject</option>{subjects.map((s) => <option key={s}>{s}</option>)}</Select><Button disabled={!sel.exam || !sel.subject} loading={start.pending} onClick={() => start.run()}>Start practice</Button></div>
          {start.error && <Alert tone="error" className="mb-4">{start.error}</Alert>}
          {qs && <div className="space-y-4">{result && <Alert tone={result.percent >= 50 ? 'success' : 'warning'} title={`Score: ${result.correct}/${result.total} (${result.percent}%)`}>Review the explanations below, then try again.</Alert>}
            {qs.map((q, i) => { const r: any = review?.get(q.id); return <div key={q.id} className="card p-5"><div className="mb-1 text-xs text-slate-500">{q.exam} {q.year}{q.topic ? ` · ${q.topic}` : ''}</div><p className="mb-3 font-medium">{i + 1}. {q.question}</p>
              <div className="space-y-1.5">{q.options.map((o: string, oi: number) => { const chosen = ans[q.id] === oi; const cls = r ? (oi === r.answer ? 'border-emerald-500 bg-emerald-50' : chosen ? 'border-red-400 bg-red-50' : 'border-slate-200') : chosen ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'; return <button key={oi} type="button" disabled={!!r} onClick={() => setAns({ ...ans, [q.id]: oi })} className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${cls}`}><span className="mr-2 font-semibold">{String.fromCharCode(65 + oi)}.</span>{o}</button>; })}</div>
              {r?.explanation && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><span className="font-semibold">Explanation: </span>{r.explanation}</p>}</div>; })}
            {!result && <Button disabled={Object.keys(ans).length !== qs.length} loading={submit.pending} onClick={() => submit.run()}>Submit answers ({Object.keys(ans).length}/{qs.length})</Button>}{submit.error && <Alert tone="error">{submit.error}</Alert>}</div>}
          {!qs && attempts.data && attempts.data.length > 0 && <div className="card p-5"><h2 className="mb-2 font-semibold">Recent attempts</h2><ul className="divide-y text-sm">{attempts.data.map((a) => <li key={a.id} className="flex justify-between py-2"><span>{a.exam} · {a.subject}</span><span>{a.correct}/{a.total} <span className="text-xs text-slate-400">{fmtDateTime(a.created_at)}</span></span></li>)}</ul></div>}
        </>}
      </QueryBoundary>
    </>
  );
}
