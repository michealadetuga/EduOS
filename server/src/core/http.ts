import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { unprocessable } from './errors.js';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/** Validate and *replace* body/query with parsed data (strips unknown keys => no mass assignment). */
export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  try {
    return schema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const i of e.issues) fields[i.path.join('.') || '_'] = i.message;
      throw unprocessable('Please correct the highlighted fields', fields);
    }
    throw e;
  }
}

export function idParam(v: string | undefined, name = 'id'): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw unprocessable(`Invalid ${name}`);
  return n;
}

export function pagination(q: Record<string, unknown>) {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function nowIso() {
  return new Date().toISOString();
}
