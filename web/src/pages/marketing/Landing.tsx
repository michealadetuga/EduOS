import { useState } from 'react';
import { Logo } from '@/layouts/AppShell';
import { Button, Icon, Badge, cx } from '@/components/ui';

const nav = [['Platform', '#platform'], ['Features', '#features'], ['For Schools', '#schools'], ['Resources', '#how']];

export function LandingPage() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white text-ink-900">
      <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2"><Logo /><span className="text-lg font-semibold">EduOS</span></a>
          <nav className="hidden gap-8 text-sm font-medium text-slate-600 md:flex">{nav.map(([l, h]) => <a key={h} href={h} className="hover:text-ink-900">{l}</a>)}</nav>
          <div className="hidden items-center gap-2 md:flex"><a href="#platform"><Button>Explore EduOS</Button></a></div>
          <button className="rounded-md p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu"><Icon.Menu /></button>
        </div>
        {open && <div className="border-t px-4 py-3 md:hidden"><div className="flex flex-col gap-2">{nav.map(([l, h]) => <a key={h} href={h} className="py-1 text-sm" onClick={() => setOpen(false)}>{l}</a>)}<a href="#platform" onClick={() => setOpen(false)}><Button className="w-full">Explore EduOS</Button></a></div></div>}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--color-brand-50),_white_60%)]" />
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge tone="brand" className="mb-4">Built for secondary schools · Multi-school platform</Badge>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">One platform for the entire school.</h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">Manage your school, empower your teachers, connect your students, and keep parents informed from one secure platform.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><a href="#platform"><Button size="lg">Explore EduOS</Button></a></div>
            <p className="mt-4 text-xs text-slate-500">Free to set up. Your school's data stays isolated from every other school.</p>
          </div>
          <DashboardPreview />
        </div>
      </section>

      {/* Value proposition */}
      <section id="platform" className="border-t bg-ink-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead eyebrow="Why EduOS" title="Less paperwork. Fewer WhatsApp threads. One source of truth." sub="Most schools run on spreadsheets, paper registers and group chats. EduOS replaces that patchwork with a single system every role can trust." />
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[[<Icon.School />, 'School administration', 'Sessions, terms, classes, arms, subjects, staff and students — configured once, used everywhere.'],
              [<Icon.Users />, 'Teacher experience', 'Attendance, continuous assessment, exam scores, assignments and class materials from any device.'],
              [<Icon.Book />, 'Student learning', 'Timetable, assignments, published results, class materials and exam-prep practice in one place.'],
              [<Icon.Shield />, 'Parent visibility', 'Parents see each linked child\'s attendance, published report cards and school announcements.']].map(([icon, t, d], i) => (
              <div key={i} className="card p-6"><div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">{icon as any}</div><h3 className="font-semibold">{t as string}</h3><p className="mt-2 text-sm text-slate-600">{d as string}</p></div>))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead eyebrow="Features" title="Everything the academic year needs" />
          <div className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-2">
            <Feature title="Results & report cards" body="Teachers enter CA and exam scores per subject sheet. Sheets move through Draft → Submitted → Approved → Published, with rejection notes and a full audit trail. Students and parents only ever see published results." points={['Configurable grading scale per school', 'Subject positions and class averages', 'Class-teacher and admin comments', 'Printable report cards with school branding']} />
            <Feature title="Attendance" body="Class registers marked in seconds. Duplicate-safe by design, term-aware, and summarised on report cards and parent dashboards." points={['Present / absent / late / excused', 'Per-class daily summaries', 'Per-student history for parents']} />
            <Feature title="Assignments & learning materials" body="Teachers publish assignments with attachments and due dates; students submit text or files; teachers grade with feedback." points={['Draft and publish control', 'Private, permission-checked file access', 'Class and subject scoped materials']} />
            <Feature title="Past questions & exam preparation" body="A foundation for WAEC, NECO, BECE and JAMB practice: questions organised by exam, year, subject and topic, with automatic marking and explanations." points={['Practice sets with instant scores', 'Original or licensed content only', 'Attempt history per student']} />
            <Feature title="Multi-school architecture" body="Each school is an isolated tenant. Every record is scoped to its school on the server — never by what the browser sends." points={['Tenant resolved from the login session', 'Cross-school access returns not-found', 'Automated isolation tests in the codebase']} />
            <Feature title="Security & data isolation" body="Role-based permissions enforced server-side, HttpOnly session cookies, rate limiting, account lockout, validated uploads and audit logs for every sensitive action." points={['Super Admin support access is logged with a reason', 'Passwords hashed with bcrypt', 'No secrets in the browser']} />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t bg-ink-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <SectionHead eyebrow="How EduOS works" title="From registration to published results" />
          <ol className="mt-12 grid gap-6 md:grid-cols-3 lg:grid-cols-6">
            {['Register your school and verify your email', 'Complete guided onboarding: session, terms, classes, subjects', 'Add teachers; import students by CSV; link parents', 'Teachers mark attendance and enter results', 'Admin reviews, approves and publishes', 'Students and parents see results instantly'].map((s, i) => (
              <li key={i} className="card p-5"><div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white">{i + 1}</div><p className="text-sm text-slate-700">{s}</p></li>))}
          </ol>
        </div>
      </section>

      {/* For schools */}
      <section id="schools" className="py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHead eyebrow="For schools" title="Designed for how Nigerian secondary schools actually run" align="left" />
            <ul className="mt-6 space-y-3 text-sm text-slate-700">{['JSS1–SS3 levels with arms like A, B, Science, Art and Commercial', 'Three-term academic sessions (e.g. 2026/2027)', 'Continuous assessment + examination scoring with WAEC-style grades', 'Admission numbers unique within your school', 'Enrollment history preserved across promotions and repeats', 'Works on phones — teachers and parents rarely sit at desktops'].map((p) => <li key={p} className="flex gap-2"><span className="mt-0.5 text-brand-700"><Icon.Check className="h-4 w-4" /></span>{p}</li>)}</ul>
          </div>
          <div className="card p-6">
            <h3 className="font-semibold">Honest about what's live</h3>
            <p className="mt-2 text-sm text-slate-600">EduOS is being built progressively. This is what's available today:</p>
            <div className="mt-4 grid gap-2 text-sm">
              {[['Admin system, onboarding, people & academics', 'Live'], ['Results workflow & report cards', 'Live'], ['Teacher portal: attendance, results, assignments, materials', 'Live'], ['Student & parent portals', 'Live'], ['Digital library & past-question practice', 'Foundation'], ['Timetable', 'Foundation'], ['Fees, SMS, virtual classes, advanced analytics', 'Planned']].map(([f, s]) => <div key={f} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><span>{f}</span><Badge tone={s === 'Live' ? 'green' : s === 'Foundation' ? 'amber' : 'gray'}>{s}</Badge></div>)}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t bg-ink-50 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <SectionHead eyebrow="FAQ" title="Common questions" />
          <div className="mt-10 divide-y rounded-xl border bg-white">
            {[['Can another school see our data?', 'No. Every record is tagged with your school on the server, and every query is scoped by the school resolved from the signed-in session. IDs from other schools simply return "not found". We test this automatically.'],
              ['How do teachers, students and parents get accounts?', 'School administrators create them. Each person receives a secure activation link by email; no passwords are shared in plain text.'],
              ['Can students see results before they are approved?', 'No. Result sheets are only visible to students and parents once a School Admin publishes them.'],
              ['What if a teacher makes a mistake after submitting?', 'The admin can reject the sheet with a note. It returns to the teacher for correction and resubmission, and the action is recorded in the audit log.'],
              ['Do you support CSV import?', 'Yes. Student CSVs are validated first — headers, duplicates, unknown classes, missing parents — and nothing is imported until every row passes.'],
              ['What does it cost?', 'EduOS is currently free while the platform is being built out with pilot schools. Subscription plans will be introduced later with clear notice.']].map(([q, a]) => <details key={q} className="group px-5 py-4"><summary className="cursor-pointer list-none font-medium">{q}</summary><p className="mt-2 text-sm text-slate-600">{a}</p></details>)}
          </div>
        </div>
      </section>

      <section className="py-20"><div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">Bring your whole school onto one platform.</h2>
        <p className="mt-3 text-slate-600">School sign-up opens soon. Guided onboarding does the rest.</p>
        <div className="mt-8 flex justify-center gap-3"><a href="#platform"><Button size="lg" variant="outline">Explore EduOS</Button></a></div>
      </div></section>

      <footer className="border-t py-10 text-sm text-slate-500"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <div className="flex items-center gap-2"><Logo className="h-6 w-6" /><span className="font-medium text-ink-900">EduOS</span><span>· One platform for the entire school.</span></div>
        <div className="flex gap-6">{nav.map(([l, h]) => <a key={h} href={h} className="hover:text-ink-900">{l}</a>)}</div>
        <span>© {new Date().getFullYear()} EduOS</span>
      </div></footer>
    </div>
  );
}

function SectionHead({ eyebrow, title, sub, align = 'center' }: { eyebrow: string; title: string; sub?: string; align?: 'center' | 'left' }) {
  return <div className={cx(align === 'center' && 'mx-auto max-w-2xl text-center')}><p className="text-sm font-semibold uppercase tracking-wider text-brand-700">{eyebrow}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h2>{sub && <p className="mt-3 text-slate-600">{sub}</p>}</div>;
}
function Feature({ title, body, points }: { title: string; body: string; points: string[] }) {
  return <div><h3 className="text-lg font-semibold">{title}</h3><p className="mt-2 text-sm text-slate-600">{body}</p><ul className="mt-3 space-y-1.5 text-sm text-slate-700">{points.map((p) => <li key={p} className="flex gap-2"><span className="mt-0.5 text-brand-700"><Icon.Check className="h-4 w-4" /></span>{p}</li>)}</ul></div>;
}

/** Product visualisation only — illustrative numbers, clearly labelled. */
function DashboardPreview() {
  return (
    <div className="relative mx-auto mt-14 max-w-5xl">
      <div className="absolute -top-3 left-1/2 -translate-x-1/2"><Badge tone="gray">Product preview · illustrative data</Badge></div>
      <div className="overflow-hidden rounded-2xl border bg-white shadow-2xl shadow-brand-900/10">
        <div className="flex">
          <div className="hidden w-52 border-r bg-slate-50 p-4 text-sm sm:block">
            <div className="mb-4 flex items-center gap-2 font-semibold"><Logo className="h-6 w-6" />EduOS</div>
            {['Dashboard', 'Academic Sessions', 'Classes & Arms', 'Subjects', 'Teachers', 'Students', 'Parents', 'Results', 'Announcements'].map((i, k) => <div key={i} className={cx('rounded-md px-2 py-1.5 text-slate-600', k === 0 && 'bg-brand-50 font-medium text-brand-800')}>{i}</div>)}
          </div>
          <div className="flex-1 p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between"><div><div className="text-base font-semibold">Good morning, Folake</div><div className="text-xs text-slate-500">2026/2027 · First Term</div></div><Badge tone="amber">2 result sheets awaiting approval</Badge></div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Students', '486'], ['Teachers', '32'], ['Classes', '18'], ['Subjects', '24']].map(([l, v]) => <div key={l} className="rounded-lg border p-3"><div className="text-[11px] uppercase text-slate-500">{l}</div><div className="text-xl font-semibold">{v}</div></div>)}</div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-lg border p-3 lg:col-span-2"><div className="mb-2 text-xs font-semibold uppercase text-slate-500">Result sheets</div>
                {[['SS2 Science · Mathematics', 'SUBMITTED', 'amber'], ['SS2 Science · Physics', 'PUBLISHED', 'green'], ['JSS1 A · English', 'DRAFT', 'gray'], ['SS3 Art · Economics', 'APPROVED', 'green']].map(([n, s, t]) => <div key={n} className="flex items-center justify-between border-t py-2 text-sm first:border-0"><span>{n}</span><Badge tone={t as any}>{s}</Badge></div>)}</div>
              <div className="rounded-lg border p-3"><div className="mb-2 text-xs font-semibold uppercase text-slate-500">Recent activity</div>
                {['Results submitted · SS2 Maths', 'Student imported · 42 rows', 'Teacher created · N. Okoro', 'Announcement · PTA meeting'].map((a) => <div key={a} className="border-t py-2 text-xs text-slate-600 first:border-0">{a}</div>)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
