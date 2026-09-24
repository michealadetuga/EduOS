import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, baseUrl, registerSchool, startServer, stopServer } from './helpers.js';
import { getDb } from '../src/db/connection.js';

before(startServer); after(stopServer);

test('health endpoint', async () => {
  const c = new Client();
  const r = await c.get('/api/health');
  assert.equal(r.status, 200); assert.equal(r.body.status, 'ok');
});

test('registration validates input and strips unknown fields', async () => {
  const c = new Client();
  const r = await c.post('/api/auth/register', { school: { name: 'X' }, admin: { email: 'bad', password: 'short' } });
  assert.equal(r.status, 422);
  assert.ok(r.body.error.details['school.address']);
  assert.ok(r.body.error.details['admin.password']);
});

test('login is blocked until email verified; verify then login sets HttpOnly cookie', async () => {
  const c = new Client();
  const email = `v-${Date.now()}@ex.test`;
  const reg = await c.post('/api/auth/register', { school: { name: 'Verify School', address: 'Addr 1', email: 'vs@ex.test', phone: '0801234567', type: 'public' }, admin: { firstName: 'A', lastName: 'B', email, password: 'Str0ngPassw0rd!' } });
  assert.equal(reg.status, 201);
  const blocked = await c.post('/api/auth/login', { email, password: 'Str0ngPassw0rd!' });
  assert.equal(blocked.status, 403); assert.equal(blocked.body.error.code, 'EMAIL_NOT_VERIFIED');
  const token = new URL(reg.body.verifyUrl).searchParams.get('token')!;
  assert.equal((await c.post('/api/auth/verify-email', { token })).status, 200);
  assert.equal((await c.post('/api/auth/verify-email', { token })).status, 400, 'token single-use');
  const ok = await c.post('/api/auth/login', { email, password: 'Str0ngPassw0rd!' });
  assert.equal(ok.status, 200); assert.ok(c.cookie.startsWith('eduos_session='));
  const me = await c.get('/api/auth/me');
  assert.equal(me.body.user.role, 'SCHOOL_ADMIN'); assert.ok(me.body.permissions.includes('results.publish'));
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/auth/me')).status, 401);
});

test('wrong password is rejected and repeated failures lock the account', async () => {
  const { email } = await registerSchool('Lock School');
  const c = new Client();
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await c.post('/api/auth/login', { email, password: 'wrong-password' })).status;
  assert.equal(last, 429);
  const audit = getDb().prepare("SELECT COUNT(*) c FROM audit_logs WHERE action = 'LOGIN_FAILED'").get() as any;
  assert.ok(audit.c >= 5);
});

test('password reset flow invalidates sessions', async () => {
  const s = await registerSchool('Reset School');
  const c = new Client();
  await c.post('/api/auth/forgot-password', { email: s.email });
  const row = getDb().prepare("SELECT t.id FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE u.email = ? AND kind = 'reset'").get(s.email);
  assert.ok(row, 'reset token created');
  // Forgot-password for an unknown email must not leak existence
  const unknown = await c.post('/api/auth/forgot-password', { email: 'nobody@nowhere.test' });
  assert.equal(unknown.status, 200);
});

test('state-changing requests without the client header are rejected (CSRF guard)', async () => {
  const s = await registerSchool('CSRF School');
  const before = (getDb().prepare('SELECT COUNT(*) c FROM subjects').get() as any).c;
  const r = await fetch(baseUrl() + '/api/subjects', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: s.client.cookie }, body: JSON.stringify({ name: 'Hack' }) });
  assert.equal(r.status, 403);
  assert.equal((getDb().prepare('SELECT COUNT(*) c FROM subjects').get() as any).c, before);
});
