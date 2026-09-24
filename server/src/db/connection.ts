import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { applySchema } from './schema.js';

let instance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (instance) return instance;
  if (env.DATABASE_URL !== ':memory:') fs.mkdirSync(path.dirname(env.DATABASE_URL), { recursive: true });
  instance = new DatabaseSync(env.DATABASE_URL);
  instance.exec('PRAGMA journal_mode = WAL');
  instance.exec('PRAGMA foreign_keys = ON');
  instance.exec('PRAGMA busy_timeout = 5000');
  applySchema(instance);
  return instance;
}

/** Run fn inside a transaction (nested calls reuse the outer transaction). */
let depth = 0;
export function transaction<T>(fn: () => T): T {
  const db = getDb();
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    depth--;
  }
}

export function resetDbForTests() {
  instance?.close();
  instance = null;
}
