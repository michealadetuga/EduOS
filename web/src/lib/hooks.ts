import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export interface QueryState<T> { data: T | null; loading: boolean; error: string | null; reload: () => void; setData: (d: T | null) => void }

/** Minimal data hook with loading/error/reload. Re-runs when deps change. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn); fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    fnRef.current().then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e instanceof Error ? e.message : 'Something went wrong'); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload, setData };
}

/** Wraps an async action with pending state and field-level errors from 422 responses. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    setPending(true); setError(null); setFields({});
    try { return await fn(...args); }
    catch (e) {
      if (e instanceof ApiError) { setError(e.message); if (e.status === 422 && e.details && typeof e.details === 'object' && !Array.isArray(e.details) && !('rows' in e.details)) setFields(e.details); }
      else setError(e instanceof Error ? e.message : 'Something went wrong');
      return undefined;
    } finally { setPending(false); }
  }, [fn]);
  return { run, pending, error, fields, reset: () => { setError(null); setFields({}); } };
}

export function useDebounce<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export const fmtDate = (s?: string | null, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) => {
  if (!s) return '—';
  const d = new Date(s.includes('T') || s.includes(' ') ? s.replace(' ', 'T') + (s.endsWith('Z') || s.includes('+') ? '' : 'Z') : s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-NG', opts);
};
export const fmtDateTime = (s?: string | null) => fmtDate(s, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const titleCase = (s?: string | null) => (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
