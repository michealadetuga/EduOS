import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, idParam, parse } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { getDb, transaction } from '../../db/connection.js';
import { audit } from '../../core/audit.js';
import { conflict } from '../../core/errors.js';
import { getOwned, updateOwned } from '../../core/tenantRepo.js';

export const academicsRouter = Router();
academicsRouter.use(requireTenant);

const sessionSchema = z.object({
  name: z.string().trim().regex(/^\d{4}\/\d{4}$/, 'Use the format 2026/2027'),
  startDate: z.string().date().optional().nullable(),
  endDate: z.string().date().optional().nullable(),
  createDefaultTerms: z.boolean().optional().default(true),
});
const termSchema = z.object({
  name: z.string().trim().min(2).max(40),
  sequence: z.number().int().min(1).max(6).optional(),
  startDate: z.string().date().optional().nullable(),
  endDate: z.string().date().optional().nullable(),
});

academicsRouter.get('/sessions', requirePermission('school.view'), asyncHandler(async (req, res) => {
  const sessions = getDb().prepare('SELECT * FROM academic_sessions WHERE school_id = ? ORDER BY name DESC').all(req.schoolId) as any[];
  const terms = getDb().prepare('SELECT * FROM terms WHERE school_id = ? ORDER BY sequence').all(req.schoolId) as any[];
  res.json(sessions.map((s) => ({ ...s, terms: terms.filter((t) => t.session_id === s.id) })));
}));

academicsRouter.get('/current', requirePermission('school.view'), asyncHandler(async (req, res) => {
  const session = getDb().prepare("SELECT * FROM academic_sessions WHERE school_id = ? AND status = 'active'").get(req.schoolId) as any;
  const term = session ? getDb().prepare('SELECT * FROM terms WHERE session_id = ? AND is_current = 1').get(session.id) : null;
  const terms = session ? getDb().prepare('SELECT * FROM terms WHERE session_id = ? ORDER BY sequence').all(session.id) : [];
  res.json({ session: session ?? null, term: term ?? null, terms });
}));

academicsRouter.post('/sessions', requirePermission('sessions.manage'), asyncHandler(async (req, res) => {
  const input = parse(sessionSchema, req.body);
  const db = getDb();
  if (db.prepare('SELECT 1 FROM academic_sessions WHERE school_id = ? AND name = ?').get(req.schoolId, input.name)) throw conflict(`Session ${input.name} already exists`);
  const hasActive = db.prepare("SELECT 1 FROM academic_sessions WHERE school_id = ? AND status = 'active'").get(req.schoolId);
  const id = transaction(() => {
    const r = db.prepare('INSERT INTO academic_sessions (school_id, name, start_date, end_date, status) VALUES (?,?,?,?,?)')
      .run(req.schoolId, input.name, input.startDate ?? null, input.endDate ?? null, hasActive ? 'upcoming' : 'active');
    const id = Number(r.lastInsertRowid);
    if (input.createDefaultTerms) {
      const ins = db.prepare('INSERT INTO terms (school_id, session_id, name, sequence, is_current) VALUES (?,?,?,?,?)');
      ['First Term', 'Second Term', 'Third Term'].forEach((n, i) => ins.run(req.schoolId, id, n, i + 1, i === 0 && !hasActive ? 1 : 0));
    }
    audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'SESSION_CREATED', entityType: 'academic_session', entityId: id, metadata: { name: input.name } });
    return id;
  });
  res.status(201).json({ id });
}));

academicsRouter.patch('/sessions/:id', requirePermission('sessions.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const p = parse(sessionSchema.partial().omit({ createDefaultTerms: true }), req.body);
  updateOwned('academic_sessions', id, req.schoolId, { name: p.name, start_date: p.startDate, end_date: p.endDate }, 'Session');
  res.json({ ok: true });
}));

academicsRouter.post('/sessions/:id/activate', requirePermission('sessions.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  getOwned('academic_sessions', id, req.schoolId, 'Session');
  transaction(() => {
    const db = getDb();
    // Only one active session per school. Previous active becomes archived (records are preserved).
    db.prepare("UPDATE academic_sessions SET status = 'archived' WHERE school_id = ? AND status = 'active' AND id != ?").run(req.schoolId, id);
    db.prepare("UPDATE academic_sessions SET status = 'active' WHERE id = ? AND school_id = ?").run(id, req.schoolId);
    db.prepare('UPDATE terms SET is_current = 0 WHERE school_id = ?').run(req.schoolId);
    db.prepare('UPDATE terms SET is_current = 1 WHERE id = (SELECT id FROM terms WHERE session_id = ? ORDER BY sequence LIMIT 1)').run(id);
    audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'SESSION_ACTIVATED', entityType: 'academic_session', entityId: id });
  });
  res.json({ ok: true });
}));

academicsRouter.post('/sessions/:id/archive', requirePermission('sessions.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  updateOwned('academic_sessions', id, req.schoolId, { status: 'archived' }, 'Session');
  getDb().prepare('UPDATE terms SET is_current = 0 WHERE session_id = ?').run(id);
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'SESSION_ARCHIVED', entityType: 'academic_session', entityId: id });
  res.json({ ok: true });
}));

academicsRouter.post('/sessions/:id/terms', requirePermission('sessions.manage'), asyncHandler(async (req, res) => {
  const sessionId = idParam(req.params.id as string);
  getOwned('academic_sessions', sessionId, req.schoolId, 'Session');
  const t = parse(termSchema, req.body);
  const db = getDb();
  if (db.prepare('SELECT 1 FROM terms WHERE session_id = ? AND name = ?').get(sessionId, t.name)) throw conflict('Term already exists');
  const seq = t.sequence ?? ((db.prepare('SELECT COALESCE(MAX(sequence),0) m FROM terms WHERE session_id = ?').get(sessionId) as any).m + 1);
  const r = db.prepare('INSERT INTO terms (school_id, session_id, name, sequence, start_date, end_date) VALUES (?,?,?,?,?,?)').run(req.schoolId, sessionId, t.name, seq, t.startDate ?? null, t.endDate ?? null);
  res.status(201).json({ id: Number(r.lastInsertRowid) });
}));

academicsRouter.patch('/terms/:id', requirePermission('sessions.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const t = parse(termSchema.partial(), req.body);
  updateOwned('terms', id, req.schoolId, { name: t.name, sequence: t.sequence, start_date: t.startDate, end_date: t.endDate }, 'Term');
  res.json({ ok: true });
}));

academicsRouter.post('/terms/:id/set-current', requirePermission('sessions.manage'), asyncHandler(async (req, res) => {
  const id = idParam(req.params.id as string);
  const term = getOwned<any>('terms', id, req.schoolId, 'Term');
  const s = getOwned<any>('academic_sessions', term.session_id, req.schoolId, 'Session');
  if (s.status !== 'active') throw conflict('Activate the session before setting its current term');
  transaction(() => {
    getDb().prepare('UPDATE terms SET is_current = 0 WHERE school_id = ?').run(req.schoolId);
    getDb().prepare('UPDATE terms SET is_current = 1 WHERE id = ?').run(id);
  });
  audit({ schoolId: req.schoolId, actorId: req.ctx!.userId, action: 'TERM_SET_CURRENT', entityType: 'term', entityId: id });
  res.json({ ok: true });
}));

/** Resolve the school's active session/current term or throw a helpful 409. */
export function currentPeriod(schoolId: number) {
  const session = getDb().prepare("SELECT * FROM academic_sessions WHERE school_id = ? AND status = 'active'").get(schoolId) as any;
  if (!session) throw conflict('No active academic session. Create or activate one first.');
  const term = getDb().prepare('SELECT * FROM terms WHERE session_id = ? AND is_current = 1').get(session.id) as any;
  return { session, term: term ?? null };
}
