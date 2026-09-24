import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '../../..');

// Load .env (no external dependency) - never overrides real environment variables.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const isTest = process.env.NODE_ENV === 'test';

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  APP_URL: process.env.APP_URL ?? '',
  DATABASE_URL: process.env.DATABASE_URL ?? (isTest ? ':memory:' : path.join(ROOT, 'data', 'eduos.db')),
  AUTH_SECRET: process.env.AUTH_SECRET ?? (isTest ? 'test-secret' : ''),
  SESSION_TTL_HOURS: Number(process.env.SESSION_TTL_HOURS ?? 24 * 7),
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER ?? 'outbox',
  EMAIL_API_KEY: process.env.EMAIL_API_KEY ?? '',
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'EduOS <no-reply@eduos.local>',
  STORAGE_PROVIDER: process.env.STORAGE_PROVIDER ?? 'local',
  STORAGE_DIR: process.env.STORAGE_DIR ?? path.join(ROOT, 'storage'),
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB ?? 10),
  isProd: process.env.NODE_ENV === 'production',
  isTest,
};

if (env.isProd && env.AUTH_SECRET.length < 32) {
  throw new Error('AUTH_SECRET must be set (>= 32 chars) in production');
}
if (!env.AUTH_SECRET) env.AUTH_SECRET = 'dev-only-insecure-secret-change-me';
