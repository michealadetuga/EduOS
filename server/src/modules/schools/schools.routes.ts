import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { asyncHandler, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { badRequest } from '../../core/errors.js';
import { buildKey, storage } from '../../core/storage.js';
import { env } from '../../config/env.js';
import { countOwned } from '../../core/tenantRepo.js';
import { DEFAULT_GRADING_SCALE, gradingScaleSchema } from '../results/grading.js';

export const schoolsRouter = Router();
schoolsRouter.use(requireTenant);

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  address: z.string().trim().max(240).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  type: z.enum(['private', 'public', 'mission', 'international', 'other']).optional(),
});

export function getSchool(schoolId: number) {
  const s = getDb().prepare('SELECT id, code, name, address, phone, email, type, logo_key, status, onboarding_step, onboarding_complete, grading_scale, created_at FROM schools WHERE id = ?').get(schoolId) as any;
  return { ...s, grading_scale: s.grading_scale ? JSON.parse(s.grading_scale) : DEFAULT_GRADING_SCALE };
}

schoolsRouter.get('/me', requirePermission('school.view'), asyncHandler(async (req, res) => res.json(getSchool(req.schoolId))));

schoolsRouter.patch('/me', requirePermission('school.update'), asyncHandler(async (req, res) => {
  const patch = parse(profileSchema, req.body);
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length) {
    getDb().prepare(`UPDATE schools SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...keys.map((k) => patch[k]!), req.schoolId);
    audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'SCHOOL_UPDATED', entityType: 'school', entityId: req.schoolId, metadata: patch, ip: req.ip });
  }
  res.json(getSchool(req.schoolId));
}));

schoolsRouter.put('/me/grading-scale', requirePermission('school.update'), asyncHandler(async (req, res) => {
  const scale = parse(gradingScaleSchema, req.body);
  getDb().prepare('UPDATE schools SET grading_scale = ? WHERE id = ?').run(JSON.stringify(scale), req.schoolId);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'GRADING_SCALE_UPDATED', entityType: 'school', entityId: req.schoolId });
  res.json(getSchool(req.schoolId));
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
schoolsRouter.post('/me/logo', requirePermission('school.update'), upload.single('logo'), asyncHandler(async (req, res) => {
  const f = req.file;
  if (!f) throw badRequest('Select an image');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.mimetype)) throw badRequest('Logo must be PNG, JPEG or WebP');
  const key = buildKey(req.schoolId, 'logo', f.originalname);
  await storage.put(key, f.buffer);
  const prev = getDb().prepare('SELECT logo_key FROM schools WHERE id = ?').get(req.schoolId) as { logo_key: string | null };
  getDb().prepare('UPDATE schools SET logo_key = ? WHERE id = ?').run(key, req.schoolId);
  if (prev.logo_key) await storage.remove(prev.logo_key);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'SCHOOL_LOGO_UPDATED', entityType: 'school', entityId: req.schoolId });
  res.json(getSchool(req.schoolId));
}));

/** Onboarding state is computed from real data so it never drifts from reality. */
schoolsRouter.get('/me/onboarding', requirePermission('school.onboard'), asyncHandler(async (req, res) => {
  const db = getDb();
  const s = getSchool(req.schoolId);
  const activeSession = db.prepare("SELECT id, name FROM academic_sessions WHERE school_id = ? AND status = 'active'").get(req.schoolId) as any;
  const steps = [
    { key: 'profile', label: 'School profile', done: !!(s.address && s.phone && s.email), required: true },
    { key: 'session', label: 'Academic session', done: !!activeSession, required: true },
    { key: 'terms', label: 'Terms', done: !!activeSession && countOwned('terms', req.schoolId, 'AND session_id = ?', [activeSession.id]) > 0, required: true },
    { key: 'classes', label: 'Classes & arms', done: countOwned('class_arms', req.schoolId) > 0, required: true },
    { key: 'subjects', label: 'Subjects', done: countOwned('subjects', req.schoolId) > 0, required: true },
    { key: 'teachers', label: 'Teachers', done: countOwned('teachers', req.schoolId) > 0, required: false },
    { key: 'students', label: 'Students', done: countOwned('students', req.schoolId) > 0, required: false },
    { key: 'parents', label: 'Parents', done: countOwned('parents', req.schoolId) > 0, required: false },
  ];
  res.json({ steps, complete: !!s.onboarding_complete, requiredDone: steps.filter((x) => x.required).every((x) => x.done) });
}));

schoolsRouter.post('/me/onboarding/complete', requirePermission('school.onboard'), asyncHandler(async (req, res) => {
  getDb().prepare('UPDATE schools SET onboarding_complete = 1 WHERE id = ?').run(req.schoolId);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'ONBOARDING_COMPLETED', entityType: 'school', entityId: req.schoolId });
  res.json({ ok: true });
}));

schoolsRouter.get('/me/dashboard', requirePermission('school.view'), asyncHandler(async (req, res) => {
  const db = getDb();
  const sid = req.schoolId;
  const session = db.prepare("SELECT id, name FROM academic_sessions WHERE school_id = ? AND status = 'active'").get(sid) as any;
  const term = session ? db.prepare('SELECT id, name FROM terms WHERE session_id = ? AND is_current = 1').get(session.id) : null;
  res.json({
    totals: {
      students: countOwned('students', sid, "AND status = 'active'"),
      teachers: countOwned('teachers', sid, "AND employment_status != 'inactive'"),
      classes: session ? countOwned('class_arms', sid, "AND session_id = ? AND status = 'active'", [session.id]) : 0,
      subjects: countOwned('subjects', sid, "AND status = 'active'"),
      parents: countOwned('parents', sid),
      pendingApprovals: countOwned('result_sheets', sid, "AND status IN ('SUBMITTED','REVIEW')"),
    },
    session, term,
    recentActivity: db.prepare(`SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at, u.first_name || ' ' || u.last_name AS actor
      FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id WHERE a.school_id = ? ORDER BY a.id DESC LIMIT 8`).all(sid),
    announcements: db.prepare('SELECT id, title, audience, publish_at FROM announcements WHERE school_id = ? ORDER BY publish_at DESC LIMIT 5').all(sid),
    genderSplit: db.prepare("SELECT gender, COUNT(*) c FROM students WHERE school_id = ? AND status='active' GROUP BY gender").all(sid),
    maxUploadMb: env.MAX_UPLOAD_MB,
  });
}));
