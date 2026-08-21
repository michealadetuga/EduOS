const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, generateSchoolCode, sha256 } = require('../db');
const { sendVerificationEmail } = require('../mailer');

const router = express.Router();
const SESSION_COOKIE = 'eduos_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; SameSite=Lax`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
    userId,
    sha256(token),
    expiresAt
  );
  return token;
}

function requireAuth(req, res, next) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  const row = db
    .prepare(
      `SELECT s.id AS session_id, u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(sha256(token));
  if (!row || Date.parse(row.expires_at) < Date.now()) {
    return res.status(401).json({ error: 'Session expired' });
  }
  req.user = row;
  next();
}

function requireAuthPage(req, res, next) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return res.redirect('/login');
  const row = db
    .prepare(
      `SELECT s.id AS session_id, u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(sha256(token));
  if (!row || Date.parse(row.expires_at) < Date.now()) {
    clearSessionCookie(res);
    return res.redirect('/login');
  }
  req.user = row;
  next();
}

router.post('/signup', (req, res) => {
  const { school = {}, admin = {} } = req.body || {};
  const name = (school.name || '').trim();
  const address = (school.address || '').trim();
  const phone = (school.phone || '').trim();
  const type = (school.type || '').trim();
  const firstName = (admin.first_name || '').trim();
  const lastName = (admin.last_name || '').trim();
  const email = (admin.email || '').trim().toLowerCase();
  const password = admin.password || '';

  if (!name) return res.status(400).json({ error: 'School name is required' });
  if (!address) return res.status(400).json({ error: 'School address is required' });
  if (!type) return res.status(400).json({ error: 'School type is required' });
  if (!firstName || !lastName) return res.status(400).json({ error: 'Your full name is required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'A valid email address is required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing)
    return res.status(409).json({ error: 'An account with this email already exists' });

  const code = generateSchoolCode();
  const hash = bcrypt.hashSync(password, 10);

  db.exec('BEGIN');
  try {
    const schoolResult = db
      .prepare('INSERT INTO schools (code, name, address, phone, type) VALUES (?, ?, ?, ?, ?)')
      .run(code, name, address, phone, type);
    const schoolId = Number(schoolResult.lastInsertRowid);
    const userResult = db
      .prepare(
        `INSERT INTO users (school_id, role, first_name, last_name, email, password_hash)
         VALUES (?, 'school_admin', ?, ?, ?, ?)`
      )
      .run(schoolId, firstName, lastName, email, hash);
    const userId = Number(userResult.lastInsertRowid);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + VERIFY_TTL_MS).toISOString();
    db.prepare('INSERT INTO verification_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(
      userId,
      sha256(token),
      expiresAt
    );
    db.exec('COMMIT');

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const verifyUrl = `${baseUrl}/verify?token=${token}`;
    sendVerificationEmail(email, firstName, verifyUrl);

    res.status(201).json({
      ok: true,
      school_code: code,
      verify_url: verifyUrl,
      message: 'School registered. Check your email to verify your account.',
    });
  } catch (err) {
    db.exec('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating your school' });
  }
});

router.post('/verify', (req, res) => {
  const token = (req.body && req.body.token) || '';
  if (!token) return res.status(400).json({ error: 'Missing verification token' });

  const row = db.prepare('SELECT * FROM verification_tokens WHERE token_hash = ?').get(sha256(token));
  if (!row) return res.status(400).json({ error: 'This verification link is invalid' });
  if (row.used_at) return res.status(400).json({ error: 'This verification link was already used' });
  if (Date.parse(row.expires_at) < Date.now())
    return res.status(400).json({ error: 'This verification link has expired' });

  db.prepare('UPDATE verification_tokens SET used_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    row.id
  );
  db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(row.user_id);
  db.prepare(
    `UPDATE schools SET status = 'active'
     WHERE id = (SELECT school_id FROM users WHERE id = ?)`
  ).run(row.user_id);

  res.json({ ok: true, message: 'Email verified. You can now log in.' });
});

router.post('/login', (req, res) => {
  const email = ((req.body && req.body.email) || '').trim().toLowerCase();
  const password = (req.body && req.body.password) || '';
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Incorrect email or password' });
  if (!user.verified)
    return res.status(403).json({ error: 'Please verify your email before logging in', needs_verification: true });

  const token = createSession(user.id);
  setSessionCookie(res, token);
  res.json({
    ok: true,
    needs_onboarding: !!user.needs_onboarding,
    redirect: '/dashboard',
  });
});

router.post('/logout', (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const { id, role, first_name, last_name, email, needs_onboarding, school_id } = req.user;
  const school = db
    .prepare('SELECT id, code, name, address, phone, type, status FROM schools WHERE id = ?')
    .get(school_id);
  res.json({
    user: { id, role, first_name, last_name, email, needs_onboarding: !!needs_onboarding },
    school,
  });
});

module.exports = { router, requireAuth, requireAuthPage };
