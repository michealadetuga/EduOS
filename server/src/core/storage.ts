import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';

/** Object storage abstraction. Keys are always tenant-prefixed: school/{schoolId}/... */
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  getPath(key: string): string;
  remove(key: string): Promise<void>;
}

const localProvider: StorageProvider = {
  async put(key, data) {
    const p = safePath(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);
  },
  getPath: (key) => safePath(key),
  async remove(key) { try { fs.unlinkSync(safePath(key)); } catch { /* ignore */ } },
};

function safePath(key: string) {
  const p = path.resolve(env.STORAGE_DIR, key);
  if (!p.startsWith(path.resolve(env.STORAGE_DIR) + path.sep)) throw new Error('Invalid storage key');
  return p;
}

export const storage: StorageProvider = localProvider;

export function buildKey(schoolId: number, folder: string, originalName: string) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10);
  return `school/${schoolId}/${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

export const ALLOWED_MIME = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
]);
