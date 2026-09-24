import express, { type ErrorRequestHandler } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { env, ROOT } from './config/env.js';
import { HttpError } from './core/errors.js';
import { authenticate, csrfGuard } from './core/auth.middleware.js';
import { registerNotificationHandlers } from './modules/notifications/handlers.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { schoolsRouter } from './modules/schools/schools.routes.js';
import { academicsRouter } from './modules/academics/academics.routes.js';
import { classesRouter } from './modules/classes/classes.routes.js';
import { subjectsRouter } from './modules/subjects/subjects.routes.js';
import { teachersRouter } from './modules/teachers/teachers.routes.js';
import { studentsRouter } from './modules/students/students.routes.js';
import { parentsRouter } from './modules/parents/parents.routes.js';
import { resultsRouter } from './modules/results/results.routes.js';
import { attendanceRouter } from './modules/attendance/attendance.routes.js';
import { assignmentsRouter } from './modules/assignments/assignments.routes.js';
import { materialsRouter } from './modules/materials/materials.routes.js';
import { pastQuestionsRouter } from './modules/past-questions/pastQuestions.routes.js';
import { timetableRouter } from './modules/timetable/timetable.routes.js';
import { announcementsRouter } from './modules/announcements/announcements.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { platformRouter } from './modules/platform/platform.routes.js';
import { portalRouter } from './modules/portal/portal.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { filesRouter, logoRouter } from './modules/files/files.js';
import { getDb } from './db/connection.js';

let handlersRegistered = false;

export function createApp() {
  if (!handlersRegistered) { registerNotificationHandlers(); handlersRegistered = true; }
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '3mb' }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (env.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });
  // Same-origin API: no CORS headers are emitted, so browsers block cross-origin reads by default.

  const health = (_req: express.Request, res: express.Response) => {
    let db = 'ok';
    try { getDb().prepare('SELECT 1').get(); } catch { db = 'error'; }
    res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', db, env: env.NODE_ENV, uptime: Math.round(process.uptime()), time: new Date().toISOString() });
  };
  app.get('/health', health);
  app.get('/api/health', health);

  const api = express.Router();
  api.use(authenticate, csrfGuard);
  api.use('/auth', authRouter);
  api.use('/schools', schoolsRouter);
  api.use('/academics', academicsRouter);
  api.use('/classes', classesRouter);
  api.use('/subjects', subjectsRouter);
  api.use('/teachers', teachersRouter);
  api.use('/students', studentsRouter);
  api.use('/parents', parentsRouter);
  api.use('/results', resultsRouter);
  api.use('/attendance', attendanceRouter);
  api.use('/assignments', assignmentsRouter);
  api.use('/materials', materialsRouter);
  api.use('/past-questions', pastQuestionsRouter);
  api.use('/timetable', timetableRouter);
  api.use('/announcements', announcementsRouter);
  api.use('/audit', auditRouter);
  api.use('/platform', platformRouter);
  api.use('/portal', portalRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/files', filesRouter);
  api.use('/logo', logoRouter);
  api.use((_req, res) => res.status(404).json({ error: { message: 'Endpoint not found', code: 'NOT_FOUND' } }));
  app.use('/api', api);

  // Serve the built SPA in production (web/dist). In development Vite proxies /api to this server.
  const dist = path.join(ROOT, 'web', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
    }
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { message: 'Malformed JSON body', code: 'BAD_REQUEST' } });
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { message: `File too large (max ${env.MAX_UPLOAD_MB} MB)`, code: 'FILE_TOO_LARGE' } });
    if (typeof err?.message === 'string' && err.message.includes('UNIQUE constraint')) return res.status(409).json({ error: { message: 'A record with these details already exists', code: 'CONFLICT' } });
    console.error(`[error] ${req.method} ${req.originalUrl}`, err instanceof Error ? err.stack : err);
    res.status(500).json({ error: { message: 'Something went wrong on our side. Please try again.', code: 'INTERNAL' } });
  };
  app.use(errorHandler);
  return app;
}
