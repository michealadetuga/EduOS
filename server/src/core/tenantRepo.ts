import { getDb } from '../db/connection.js';
import { notFound } from './errors.js';

/**
 * Tenant-scoped data-access helpers. Every read/write includes school_id so a valid id from
 * another school behaves exactly like a non-existent id (404), preventing IDOR/BOLA.
 */
export function findOwned<T = any>(table: string, id: number, schoolId: number): T | undefined {
  return getDb().prepare(`SELECT * FROM ${table} WHERE id = ? AND school_id = ?`).get(id, schoolId) as T | undefined;
}
export function getOwned<T = any>(table: string, id: number, schoolId: number, label = 'Record'): T {
  const row = findOwned<T>(table, id, schoolId);
  if (!row) throw notFound(`${label} not found`);
  return row;
}
export function assertOwned(table: string, id: number | null | undefined, schoolId: number, label: string) {
  if (id === null || id === undefined) return;
  if (!findOwned(table, id, schoolId)) throw notFound(`${label} not found`);
}
export function deleteOwned(table: string, id: number, schoolId: number, label = 'Record') {
  const r = getDb().prepare(`DELETE FROM ${table} WHERE id = ? AND school_id = ?`).run(id, schoolId);
  if (!r.changes) throw notFound(`${label} not found`);
}
export function countOwned(table: string, schoolId: number, where = '', params: unknown[] = []) {
  return (getDb().prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE school_id = ? ${where}`).get(schoolId, ...(params as any[])) as { c: number }).c;
}

/** Build a partial UPDATE from an already-validated object (unknown keys were stripped by zod). */
export function updateOwned(table: string, id: number, schoolId: number, patch: Record<string, unknown>, label = 'Record') {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (!keys.length) return;
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const r = getDb().prepare(`UPDATE ${table} SET ${sets} WHERE id = ? AND school_id = ?`).run(...keys.map((k) => patch[k] as any), id, schoolId);
  if (!r.changes) throw notFound(`${label} not found`);
}

export function paged<T>(sql: string, countSql: string, params: unknown[], page: number, pageSize: number) {
  const db = getDb();
  const total = (db.prepare(countSql).get(...(params as any[])) as { c: number }).c;
  const items = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...(params as any[]), pageSize, (page - 1) * pageSize) as T[];
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
