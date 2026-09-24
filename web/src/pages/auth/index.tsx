import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useAuth, homeFor } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { AuthLayout } from '@/layouts/AppShell';
import { Alert, Button, FormField, Input, Select } from '@/components/ui';

export function LoginPage() {
  const { refresh, me } = useAuth(); const nav = useNavigate(); const [sp] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '' });
  const [needsVerify, setNeedsVerify] = useState(false);
  const act = useAction(async () => {
    try {
      const r = await api.post<{ role: string; mustChangePassword: boolean }>('/api/auth/login', form);
      await refresh();
      nav(r.mustChangePassword ? '/account/password' : sp.get('next') || homeFor(r.role as any));
    } catch (e) { if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') setNeedsVerify(true); throw e; }
  });
  useEffect(() => { if (me) nav(homeFor(me.user.role), { replace: true }); }, [me, nav]);
  return (
    <AuthLayout title="Sign in to EduOS" subtitle="Use the email your school registered you with." footer={<>New school? <Link className="text-brand-700 hover:underline" to="/register">Register your school</Link></>}>
      {sp.get('verified') && <Alert tone="success" className="mb-4">Email verified. You can now sign in.</Alert>}
      {sp.get('reset') && <Alert tone="success" className="mb-4">Password updated. Sign in with your new password.</Alert>}
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); void act.run(); }} className="space-y-4">
        {act.error && <Alert tone="error">{act.error}{needsVerify && <div className="mt-1"><Link to={`/verify-email?resend=${encodeURIComponent(form.email)}`} className="underline">Resend verification email</Link></div>}</Alert>}
        <FormField label="Email" error={act.fields.email}><Input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
        <FormField label="Password" error={act.fields.password}><Input type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></FormField>
        <div className="flex items-center justify-between"><Link to="/forgot-password" className="text-sm text-brand-700 hover:underline">Forgot password?</Link></div>
        <Button type="submit" className="w-full" loading={act.pending}>Sign in</Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const nav = useNavigate();
  const [school, setSchool] = useState({ name: '', address: '', email: '', phone: '', type: 'private' });
  const [admin, setAdmin] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [done, setDone] = useState<{ verifyUrl?: string; schoolCode: string } | null>(null);
  const act = useAction(async () => setDone(await api.post('/api/auth/register', { school, admin })));
  if (done) return (
    <AuthLayout title="Check your email" subtitle="We sent a verification link to your address. Verify to activate your school.">
      <Alert tone="success"><p>Your school code is <strong>{done.schoolCode}</strong>.</p></Alert>
      {done.verifyUrl && <Alert tone="info" className="mt-3"><p className="font-medium">Development mode</p><p className="mt-1 break-all text-xs">Email delivery is written to the local outbox. Verify now: <a className="underline" href={done.verifyUrl}>{done.verifyUrl}</a></p></Alert>}
      <Button className="mt-4 w-full" variant="outline" onClick={() => nav('/login')}>Go to sign in</Button>
    </AuthLayout>
  );
  const f = act.fields;
  return (
    <AuthLayout title="Register your school" subtitle="Create your school's EduOS workspace. You'll become its first School Administrator." footer={<>Already registered? <Link className="text-brand-700 hover:underline" to="/login">Sign in</Link></>}>
      <form onSubmit={(e) => { e.preventDefault(); void act.run(); }} className="space-y-5">
        {act.error && <Alert tone="error">{act.error}</Alert>}
        <fieldset className="space-y-3"><legend className="text-sm font-semibold text-ink-700">School</legend>
          <FormField label="School name" required error={f['school.name']}><Input value={school.name} onChange={(e) => setSchool({ ...school, name: e.target.value })} /></FormField>
          <FormField label="Address" required error={f['school.address']}><Input value={school.address} onChange={(e) => setSchool({ ...school, address: e.target.value })} /></FormField>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Contact email" required error={f['school.email']}><Input type="email" value={school.email} onChange={(e) => setSchool({ ...school, email: e.target.value })} /></FormField>
            <FormField label="Phone" required error={f['school.phone']}><Input value={school.phone} onChange={(e) => setSchool({ ...school, phone: e.target.value })} /></FormField>
          </div>
          <FormField label="School type" required error={f['school.type']}><Select value={school.type} onChange={(e) => setSchool({ ...school, type: e.target.value })}><option value="private">Private</option><option value="public">Public / Government</option><option value="mission">Mission / Faith-based</option><option value="international">International</option><option value="other">Other</option></Select></FormField>
        </fieldset>
        <fieldset className="space-y-3"><legend className="text-sm font-semibold text-ink-700">Administrator account</legend>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="First name" required error={f['admin.firstName']}><Input value={admin.firstName} onChange={(e) => setAdmin({ ...admin, firstName: e.target.value })} /></FormField>
            <FormField label="Last name" required error={f['admin.lastName']}><Input value={admin.lastName} onChange={(e) => setAdmin({ ...admin, lastName: e.target.value })} /></FormField>
          </div>
          <FormField label="Your email" required error={f['admin.email']}><Input type="email" autoComplete="email" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} /></FormField>
          <FormField label="Password" required error={f['admin.password']} hint="At least 8 characters."><Input type="password" autoComplete="new-password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} /></FormField>
        </fieldset>
        <Button type="submit" className="w-full" loading={act.pending}>Create school workspace</Button>
        <p className="text-center text-xs text-slate-500">By registering you agree to keep student data confidential and use EduOS responsibly.</p>
      </form>
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  const [sp] = useSearchParams(); const token = sp.get('token'); const resend = sp.get('resend');
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending'); const [msg, setMsg] = useState('');
  const [email, setEmail] = useState(resend ?? ''); const [sent, setSent] = useState(false);
  useEffect(() => { if (!token) { setState('error'); setMsg('This verification link is incomplete.'); return; } api.post('/api/auth/verify-email', { token }).then(() => setState('ok')).catch((e) => { setState('error'); setMsg(e.message); }); }, [token]);
  return (
    <AuthLayout title="Verify your email">
      {state === 'pending' && <p className="text-sm text-slate-500">Verifying…</p>}
      {state === 'ok' && <><Alert tone="success">Email verified. Your school is now active.</Alert><Link to="/login?verified=1"><Button className="mt-4 w-full">Continue to sign in</Button></Link></>}
      {state === 'error' && <>
        <Alert tone="error">{msg}</Alert>
        <form className="mt-4 space-y-3" onSubmit={async (e) => { e.preventDefault(); await api.post('/api/auth/resend-verification', { email }); setSent(true); }}>
          <FormField label="Resend verification to"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></FormField>
          {sent ? <Alert tone="success">If that account needs verification, a new link has been sent.</Alert> : <Button type="submit" variant="outline" className="w-full">Resend link</Button>}
        </form></>}
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false);
  const act = useAction(async () => { await api.post('/api/auth/forgot-password', { email }); setSent(true); });
  return (
    <AuthLayout title="Reset your password" subtitle="Enter your email and we'll send a reset link." footer={<Link className="text-brand-700 hover:underline" to="/login">Back to sign in</Link>}>
      {sent ? <Alert tone="success">If that email exists, a reset link has been sent. Check your inbox (or the local outbox in development).</Alert> :
        <form onSubmit={(e) => { e.preventDefault(); void act.run(); }} className="space-y-4">{act.error && <Alert tone="error">{act.error}</Alert>}
          <FormField label="Email" error={act.fields.email}><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></FormField>
          <Button type="submit" className="w-full" loading={act.pending}>Send reset link</Button></form>}
    </AuthLayout>
  );
}

export function SetPasswordPage({ mode }: { mode: 'reset' | 'invite' }) {
  const [sp] = useSearchParams(); const nav = useNavigate(); const token = sp.get('token') ?? '';
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const act = useAction(async () => {
    if (password !== confirm) throw new Error('Passwords do not match');
    await api.post(mode === 'reset' ? '/api/auth/reset-password' : '/api/auth/accept-invite', { token, password });
    nav('/login?reset=1');
  });
  return (
    <AuthLayout title={mode === 'reset' ? 'Choose a new password' : 'Activate your EduOS account'} subtitle={mode === 'invite' ? 'Set a password to finish setting up the account your school created for you.' : undefined}>
      <form onSubmit={(e) => { e.preventDefault(); void act.run(); }} className="space-y-4">{act.error && <Alert tone="error">{act.error}</Alert>}
        <FormField label="New password" error={act.fields.password} hint="At least 8 characters."><Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></FormField>
        <FormField label="Confirm password"><Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></FormField>
        <Button type="submit" className="w-full" loading={act.pending}>{mode === 'reset' ? 'Update password' : 'Activate account'}</Button></form>
    </AuthLayout>
  );
}

export function ChangePasswordPage() {
  const { me, refresh } = useAuth(); const nav = useNavigate();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const act = useAction(async () => {
    if (f.newPassword !== f.confirm) throw new Error('Passwords do not match');
    await api.post('/api/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword });
    await refresh(); nav(homeFor(me?.user.role));
  });
  return (
    <AuthLayout title="Change your password" subtitle={me?.user.mustChangePassword ? 'For security, please set a new password before continuing.' : undefined}>
      <form onSubmit={(e) => { e.preventDefault(); void act.run(); }} className="space-y-4">{act.error && <Alert tone="error">{act.error}</Alert>}
        <FormField label="Current password"><Input type="password" required value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></FormField>
        <FormField label="New password" error={act.fields.newPassword}><Input type="password" required value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></FormField>
        <FormField label="Confirm new password"><Input type="password" required value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></FormField>
        <Button type="submit" className="w-full" loading={act.pending}>Update password</Button>
        {!me?.user.mustChangePassword && <Button type="button" variant="ghost" className="w-full" onClick={() => nav(-1)}>Cancel</Button>}
      </form>
    </AuthLayout>
  );
}
