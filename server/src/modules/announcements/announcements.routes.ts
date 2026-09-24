import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { emit } from '../../core/events.js';
import { deleteOwned, updateOwned } from '../../core/tenantRepo.js';

export const announcementsRouter = Router();
announcementsRouter.use(requireTenant);

const schema = z.object({
  title: z.string().trim().min(2).max(140), content: z.string().trim().min(2).max(5000),
  audience: z.enum(['all', 'teachers', 'students', 'parents']).default('all'),
  publishAt: z.string().datetime({ offset: true }).optional().nullable(), expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
});
const audienceFor: Record<string, string[]> = { SCHOOL_ADMIN: ['all', 'teachers', 'students', 'parents'], TEACHER: ['all', 'teachers'], STUDENT: ['all', 'students'], PARENT: ['all', 'parents'] };

announcementsRouter.get('/', requirePermission('announcements.view'), asyncHandler(async (req, res) => {
  const aud = audienceFor[req.ctx!.role] ?? ['all'];
  const isAdmin = req.ctx!.role === 'SCHOOL_ADMIN';
  const rows = getDb().prepare(`SELECT a.*, u.first_name || ' ' || u.last_name AS author FROM announcements a LEFT JOIN users u ON u.id = a.author_id
    WHERE a.school_id = ? AND a.audience IN (${aud.map(() => '?').join(',')}) ${isAdmin ? '' : "AND a.publish_at <= datetime('now') AND (a.expires_at IS NULL OR a.expires_at > datetime('now'))"}
    ORDER BY a.publish_at DESC LIMIT 100`).all(req.schoolId, ...aud);
  res.json(rows);
}));

announcementsRouter.post('/', requirePermission('announcements.manage'), asyncHandler(async (req, res) => {
  const a = parse(schema, req.body);
  const r = getDb().prepare("INSERT INTO announcements (school_id, author_id, title, content, audience, publish_at, expires_at) VALUES (?,?,?,?,?,COALESCE(?, datetime('now')),?)")
    .run(req.schoolId, req.ctx!.userId, a.title, a.content, a.audience, a.publishAt ?? null, a.expiresAt ?? null);
  const id = Number(r.lastInsertRowid);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'ANNOUNCEMENT_PUBLISHED', entityType: 'announcement', entityId: id, metadata: { title: a.title, audience: a.audience } });
  if (!a.publishAt || Date.parse(a.publishAt) <= Date.now()) emit({ type: 'ANNOUNCEMENT_PUBLISHED', schoolId: req.schoolId, announcementId: id, audience: a.audience, title: a.title });
  res.status(201).json({ id });
}));

announcementsRouter.patch('/:id', requirePermission('announcements.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string); const a = parse(schema.partial(), req.body);
  updateOwned('announcements', id, req.schoolId, { title: a.title, content: a.content, audience: a.audience, publish_at: a.publishAt, expires_at: a.expiresAt }, 'Announcement');
  res.json({ ok: true });
}));
announcementsRouter.delete('/:id', requirePermission('announcements.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  deleteOwned('announcements', id, req.schoolId, 'Announcement');
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'ANNOUNCEMENT_DELETED', entityType: 'announcement', entityId: id });
  res.json({ ok: true });
}));
