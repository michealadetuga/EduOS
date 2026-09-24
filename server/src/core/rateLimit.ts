import type { RequestHandler } from 'express';
import { getDb } from '../db/connection.js';
import { tooMany } from './errors.js';
import { env } from '../config/env.js';

/** DB-backed fixed-window limiter (works across restarts; swap for Redis when horizontally scaled). */
export function rateLimit(name: string, max: number, windowMs: number, keyFn?: (req: any) => string): RequestHandler {
  if (env.isTest) max *= 100; // tests share one IP
  return (req, _res, next) => {
    const key = `${name}:${keyFn ? keyFn(req) : req.ip}`;
    const now = Date.now();
    const db = getDb();
    const row = db.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').get(key) as { count: number; reset_at: number } | undefined;
    if (!row || row.reset_at < now) {
      db.prepare('INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at').run(key, now + windowMs);
      return next();
    }
    if (row.count >= max) return next(tooMany());
    db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(key);
    next();
  };
}
