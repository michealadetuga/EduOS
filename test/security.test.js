const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { db } = require('../src/db');

const port = 3107;
const baseUrl = `http://127.0.0.1:${port}`;
const email = `security-test-${Date.now()}@example.com`;
let schoolId;
let userId;
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await fetch(`${baseUrl}/api/me`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Server did not start');
}

async function post(pathname, body, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

async function run() {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  await waitForServer();

  const signup = await post('/api/signup', {
    school: { name: 'Security Test School', address: 'Test address', type: 'private' },
    admin: { first_name: 'Test', last_name: 'Admin', email, password: 'test-password-123' },
  });
  assert.equal(signup.response.status, 201);

  const verifyToken = new URL(signup.body.verify_url).searchParams.get('token');
  const verification = await post('/api/verify', { token: verifyToken });
  assert.equal(verification.response.status, 200);

  const login = await post('/api/login', { email, password: 'test-password-123' });
  assert.equal(login.response.status, 200);
  const cookies = login.response.headers.getSetCookie?.() || [login.response.headers.get('set-cookie')];
  const sessionCookie = cookies.find((cookie) => cookie)?.split(';')[0];
  assert.ok(sessionCookie);

  const user = db.prepare('SELECT id, school_id FROM users WHERE email = ?').get(email);
  schoolId = user.school_id;
  userId = user.id;
  db.prepare("UPDATE schools SET status = 'suspended' WHERE id = ?").run(schoolId);

  const me = await fetch(`${baseUrl}/api/me`, { headers: { Cookie: sessionCookie } });
  assert.equal(me.status, 403);
  assert.deepEqual(await me.json(), { error: 'School access is currently unavailable' });

  console.log('Security smoke test passed');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (server) server.kill();
    if (userId) db.prepare('DELETE FROM verification_tokens WHERE user_id = ?').run(userId);
    if (userId) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    if (userId) db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    if (schoolId) db.prepare('DELETE FROM settings WHERE school_id = ?').run(schoolId);
    if (schoolId) db.prepare('DELETE FROM schools WHERE id = ?').run(schoolId);
  });
