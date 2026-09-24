export class HttpError extends Error {
  constructor(public status: number, message: string, public code = 'ERROR', public details?: unknown) {
    super(message);
  }
}
export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, 'BAD_REQUEST', d);
export const unauthorized = (m = 'Authentication required') => new HttpError(401, m, 'UNAUTHORIZED');
export const forbidden = (m = 'You do not have permission to do this') => new HttpError(403, m, 'FORBIDDEN');
export const notFound = (m = 'Not found') => new HttpError(404, m, 'NOT_FOUND');
export const conflict = (m: string) => new HttpError(409, m, 'CONFLICT');
export const unprocessable = (m: string, d?: unknown) => new HttpError(422, m, 'VALIDATION_ERROR', d);
export const tooMany = (m = 'Too many requests. Please try again later.') => new HttpError(429, m, 'RATE_LIMITED');
