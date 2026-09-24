import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, idParam } from '../../core/http.js';
import { requireTenant } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';
import { badRequest, forbidden, notFound } from '../../core/errors.js';
import { ALLOWED_MIME, buildKey, storage } from '../../core/storage.js';
import { env } from '../../config/env.js';
import type { Request } from 'express';
import { teacherIdOf } from '../results/results.service.js';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 } });

export async function storeUpload(req: Request, folder: string): Promise<number | null> {
  const f = req.file;
  if (!f) return null;
  if (!ALLOWED_MIME.has(f.mimetype)) throw badRequest('This file type is not allowed');
  if (/[\\/]/.test(f.originalname)) throw badRequest('Invalid file name');
  const key = buildKey(req.schoolId, folder, f.originalname);
  await storage.put(key, f.buffer);
  const r = getDb().prepare('INSERT INTO files (school_id, storage_key, original_name, mime_type, size, uploaded_by) VALUES (?,?,?,?,?,?)')
    .run(req.schoolId, key, f.originalname.slice(0, 200), f.mimetype, f.size, req.ctx!.userId);
  return Number(r.lastInsertRowid);
}

/**
 * Authorised download. The file must belong to the caller's school AND the caller must be allowed
 * to see the resource that references it (material/assignment/submission). No public URLs.
 */
export const filesRouter = Router();
filesRouter.use(requireTenant);
filesRouter.get('/:id', asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const db = getDb();
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND school_id = ?').get(id, req.schoolId) as any;
  if (!file) throw notFound('File not found');
  const ctx = req.ctx!;
  if (ctx.role === 'STUDENT' || ctx.role === 'PARENT') {
    const studentIds = ctx.role === 'STUDENT'
      ? (db.prepare('SELECT id FROM students WHERE user_id = ?').all(ctx.userId) as any[]).map((r) => r.id)
      : (db.prepare('SELECT sp.student_id AS id FROM parents p JOIN student_parents sp ON sp.parent_id = p.id WHERE p.user_id = ?').all(ctx.userId) as any[]).map((r) => r.id);
    const inClasses = studentIds.length ? (db.prepare(`SELECT DISTINCT class_arm_id FROM enrollments WHERE student_id IN (${studentIds.map(() => '?').join(',')})`).all(...studentIds) as any[]).map((r) => r.class_arm_id) : [];
    const cl = inClasses.length ? inClasses.map(() => '?').join(',') : 'NULL';
    const ok = db.prepare(`SELECT 1 WHERE EXISTS (SELECT 1 FROM materials m WHERE m.file_id = ? AND (m.class_arm_id IS NULL OR m.class_arm_id IN (${cl})))
      OR EXISTS (SELECT 1 FROM assignments a WHERE a.file_id = ? AND a.status != 'draft' AND a.class_arm_id IN (${cl}))
      OR EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.file_id = ? AND s.student_id IN (${studentIds.length ? studentIds.map(() => '?').join(',') : 'NULL'}))`)
      .get(id, ...inClasses, id, ...inClasses, id, ...studentIds);
    if (!ok) throw forbidden();
  } else if (ctx.role === 'TEACHER') {
    const tid = teacherIdOf(ctx);
    const ok = db.prepare(`SELECT 1 WHERE EXISTS (SELECT 1 FROM materials m WHERE m.file_id = ?)
      OR EXISTS (SELECT 1 FROM assignments a WHERE a.file_id = ?)
      OR EXISTS (SELECT 1 FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.file_id = ? AND a.teacher_id = ?)
      OR ? = ?`).get(id, id, id, tid, file.uploaded_by, ctx.userId);
    if (!ok) throw forbidden();
  }
  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(file.original_name)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(storage.getPath(file.storage_key));
}));

/** Public school logo (branding only, not private data). */
export const logoRouter = Router();
logoRouter.get('/:schoolId', asyncHandler(async (req, res) => {
  const s = getDb().prepare('SELECT logo_key FROM schools WHERE id = ?').get(idParam(req.params.schoolId as string)) as any;
  if (!s?.logo_key) throw notFound();
  res.sendFile(storage.getPath(s.logo_key));
}));
