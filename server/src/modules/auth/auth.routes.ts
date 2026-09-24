import { Router } from 'express';
import { asyncHandler, parse } from '../../core/http.js';
import { rateLimit } from '../../core/rateLimit.js';
import { authService } from './auth.service.js';
import { acceptInviteSchema, changePasswordSchema, emailSchema, loginSchema, registerSchema, resetSchema, tokenSchema } from './auth.schema.js';
import { clearSessionCookie, readCookie, requireAuth, SESSION_COOKIE, setSessionCookie } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';
import { env } from '../../config/env.js';
import { forbidden } from '../../core/errors.js';

export const authRouter = Router();
const baseUrl = (req: any) => env.APP_URL || `${req.protocol}://${req.get('host')}`;

authRouter.post('/register', rateLimit('register', 10, 3600_000), asyncHandler(async (req, res) => {
  if (!env.ALLOW_SCHOOL_SIGNUP) throw forbidden('School self-registration is currently closed. Contact EduOS to onboard your school.');
  const input = parse(registerSchema, req.body);
  const out = await authService.registerSchool(input, baseUrl(req), req.ip ?? null);
  res.status(201).json({ message: 'School registered. Check your email to verify your account.', schoolCode: out.code, verifyUrl: out.verifyUrl });
}));

authRouter.post('/verify-email', rateLimit('verify', 20, 3600_000), asyncHandler(async (req, res) => {
  authService.verifyEmail(parse(tokenSchema, req.body).token);
  res.json({ message: 'Email verified. You can now sign in.' });
}));

authRouter.post('/resend-verification', rateLimit('resend', 5, 3600_000), asyncHandler(async (req, res) => {
  await authService.resendVerification(parse(emailSchema, req.body).email, baseUrl(req));
  res.json({ message: 'If that account needs verification, a new link has been sent.' });
}));

authRouter.post('/login', rateLimit('login', 20, 15 * 60_000), asyncHandler(async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const { token, user } = await authService.login(email, password, req.ip ?? null, req.get('user-agent') ?? null);
  setSessionCookie(res, token);
  res.json({ role: user.role, mustChangePassword: !!user.must_change_password });
}));

authRouter.post('/logout', asyncHandler(async (req, res) => {
  authService.logout(readCookie(req, SESSION_COOKIE));
  clearSessionCookie(res);
  res.json({ ok: true });
}));

authRouter.post('/forgot-password', rateLimit('forgot', 5, 3600_000), asyncHandler(async (req, res) => {
  await authService.forgotPassword(parse(emailSchema, req.body).email, baseUrl(req));
  res.json({ message: 'If that email exists, a reset link has been sent.' });
}));

authRouter.post('/reset-password', rateLimit('reset', 10, 3600_000), asyncHandler(async (req, res) => {
  const { token, password } = parse(resetSchema, req.body);
  await authService.resetPassword(token, password, 'reset');
  res.json({ message: 'Password updated. Sign in with your new password.' });
}));

authRouter.post('/accept-invite', rateLimit('invite', 10, 3600_000), asyncHandler(async (req, res) => {
  const { token, password } = parse(acceptInviteSchema, req.body);
  await authService.resetPassword(token, password, 'invite');
  res.json({ message: 'Account activated. You can now sign in.' });
}));

authRouter.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = parse(changePasswordSchema, req.body);
  await authService.changePassword(req.ctx!.userId, currentPassword, newPassword);
  res.json({ message: 'Password changed.' });
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const c = req.ctx!;
  const school = c.schoolId
    ? getDb().prepare('SELECT id, code, name, logo_key, status, onboarding_complete, onboarding_step FROM schools WHERE id = ?').get(c.schoolId)
    : null;
  const profile = c.role === 'TEACHER' ? getDb().prepare('SELECT id FROM teachers WHERE user_id = ?').get(c.userId)
    : c.role === 'STUDENT' ? getDb().prepare('SELECT id, admission_no FROM students WHERE user_id = ?').get(c.userId)
    : c.role === 'PARENT' ? getDb().prepare('SELECT id FROM parents WHERE user_id = ?').get(c.userId) : null;
  res.json({
    user: { id: c.userId, name: c.name, email: c.email, role: c.role, mustChangePassword: c.mustChangePassword },
    permissions: [...(req.perms ?? [])],
    school, profile,
  });
}));
