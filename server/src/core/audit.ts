import { getDb } from '../db/connection.js';

const SENSITIVE = /password|token|secret|hash/i;
function scrub(meta: unknown): unknown {
  if (!meta || typeof meta !== 'object') return meta;
  if (Array.isArray(meta)) return meta.map(scrub);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) out[k] = SENSITIVE.test(k) ? '[redacted]' : scrub(v);
  return out;
}

export interface AuditEvent {
  schoolId: number | null;
  actorId: number | null;
  action: string;
  entityType?: string;
  entityId?: number | null;
  metadata?: unknown;
  ip?: string | null;
}

export function audit(e: AuditEvent) {
  getDb()
    .prepare(`INSERT INTO audit_logs (school_id, actor_id, action, entity_type, entity_id, metadata, ip_address) VALUES (?,?,?,?,?,?,?)`)
    .run(e.schoolId, e.actorId, e.action, e.entityType ?? null, e.entityId ?? null, e.metadata ? JSON.stringify(scrub(e.metadata)) : null, e.ip ?? null);
}
