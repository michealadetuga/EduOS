import { Router } from 'express';
import { asyncHandler, idParam } from '../../core/http.js';
import { requireAuth } from '../../core/auth.middleware.js';
import { getDb } from '../../db/connection.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', asyncHandler(async (req, res) => {
  const items = getDb().prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(req.ctx!.userId);
  const unread = (getDb().prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.ctx!.userId) as any).c;
  res.json({ items, unread });
}));
notificationsRouter.post('/read-all', asyncHandler(async (req, res) => {
  getDb().prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.ctx!.userId);
  res.json({ ok: true });
}));
notificationsRouter.post('/:id/read', asyncHandler(async (req, res) => {
  getDb().prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?").run(idParam(req.params.id as string), req.ctx!.userId);
  res.json({ ok: true });
}));
