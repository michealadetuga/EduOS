export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'ERROR', public details?: Record<string, string> | any) { super(message); }
}

async function request<T>(method: string, url: string, body?: unknown, isForm = false): Promise<T> {
  const headers: Record<string, string> = { 'x-eduos-client': 'web' };
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, credentials: 'same-origin', body: isForm ? (body as FormData) : body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const e = (data && data.error) || {};
    throw new ApiError(res.status, e.message || (typeof data === 'string' && data) || 'Request failed', e.code, e.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) => request<T>('POST', url, form, true),
};

export const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
