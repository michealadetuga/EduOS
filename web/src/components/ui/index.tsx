import { createContext, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------- Button ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 focus-visible:ring-brand-500 shadow-sm',
  secondary: 'bg-slate-100 text-ink-900 hover:bg-slate-200 focus-visible:ring-slate-400',
  outline: 'border border-slate-300 bg-white text-ink-900 hover:bg-slate-50 focus-visible:ring-slate-400',
  ghost: 'text-ink-700 hover:bg-slate-100 focus-visible:ring-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500 shadow-sm',
};
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };
  return (
    <button disabled={disabled || loading} className={cx('inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60', variants[variant], sizes[size], className)} {...rest}>
      {loading && <Spinner className="h-4 w-4" />}{children}
    </button>
  );
}
export const Spinner = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={cx('animate-spin text-current', className)} viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
);

// ---------- Form ----------
export function FormField({ label, error, hint, required, children, className }: { label?: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}{required && <span className="text-red-500"> *</span>}</label>}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
export const Input = ({ className, error, ...p }: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) => <input className={cx('input', error && 'input-error', className)} {...p} />;
export const Textarea = ({ className, error, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) => <textarea className={cx('input min-h-24', error && 'input-error', className)} {...p} />;
export const Select = ({ className, error, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }) => <select className={cx('input', error && 'input-error', className)} {...p}>{children}</select>;
export function Checkbox({ label, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="flex items-center gap-2 text-sm text-ink-700"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500" {...p} />{label}</label>;
}

// ---------- Badge ----------
const tones: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700', green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', red: 'bg-red-50 text-red-700 ring-red-600/20', amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20', brand: 'bg-brand-50 text-brand-800 ring-brand-600/20', purple: 'bg-violet-50 text-violet-700 ring-violet-600/20',
};
export const Badge = ({ tone = 'gray', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) => (
  <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent', tones[tone], className)}>{children}</span>
);
export const statusTone = (s?: string | null): keyof typeof tones => {
  switch ((s ?? '').toLowerCase()) {
    case 'active': case 'published': case 'approved': case 'present': case 'graded': case 'full_time': return 'green';
    case 'suspended': case 'rejected': case 'absent': case 'inactive': case 'archived': return 'red';
    case 'pending': case 'submitted': case 'review': case 'late': case 'upcoming': case 'draft': return 'amber';
    case 'excused': case 'closed': return 'blue';
    default: return 'gray';
  }
};
export const StatusBadge = ({ status }: { status?: string | null }) => <Badge tone={statusTone(status)}>{(status ?? '—').replace(/_/g, ' ')}</Badge>;

// ---------- Alert / Empty / Loading ----------
export function Alert({ tone = 'info', title, children, className }: { tone?: 'info' | 'error' | 'success' | 'warning'; title?: string; children?: ReactNode; className?: string }) {
  const t = { info: 'border-blue-200 bg-blue-50 text-blue-900', error: 'border-red-200 bg-red-50 text-red-900', success: 'border-emerald-200 bg-emerald-50 text-emerald-900', warning: 'border-amber-200 bg-amber-50 text-amber-900' }[tone];
  return <div role={tone === 'error' ? 'alert' : undefined} className={cx('rounded-lg border px-4 py-3 text-sm', t, className)}>{title && <p className="font-semibold">{title}</p>}{children}</div>;
}
export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">{icon ?? <Icon.Inbox />}</div>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export const LoadingState = ({ label = 'Loading…' }: { label?: string }) => <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Spinner className="h-4 w-4" />{label}</div>;
export const Skeleton = ({ className }: { className?: string }) => <div className={cx('animate-pulse rounded-md bg-slate-200', className)} />;
export function QueryBoundary({ loading, error, children, onRetry }: { loading: boolean; error: string | null; children: ReactNode; onRetry?: () => void }) {
  if (loading) return <LoadingState />;
  if (error) return <Alert tone="error" title="Could not load this page">{error}{onRetry && <div className="mt-2"><Button size="sm" variant="outline" onClick={onRetry}>Try again</Button></div>}</Alert>;
  return <>{children}</>;
}

// ---------- Modal / Confirm / Drawer ----------
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); document.body.style.overflow = 'hidden'; return () => { window.removeEventListener('keydown', h); document.body.style.overflow = ''; }; }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', w)}>
        <div className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-base font-semibold">{title}</h2><button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><Icon.X /></button></div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3">{footer}</div>}
      </div>
    </div>, document.body);
}
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, pending }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: string; confirmLabel?: string; danger?: boolean; pending?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={pending} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-ink-900/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4"><h2 className="font-semibold">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100"><Icon.X /></button></div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>, document.body);
}

// ---------- Dropdown ----------
export function Dropdown({ trigger, children, align = 'right' }: { trigger: ReactNode; children: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && <div onClick={() => setOpen(false)} className={cx('absolute z-30 mt-1 min-w-44 overflow-hidden rounded-lg border bg-white py-1 shadow-lg', align === 'right' ? 'right-0' : 'left-0')}>{children}</div>}
    </div>
  );
}
export const MenuItem = ({ children, danger, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) => <button className={cx('block w-full px-3 py-2 text-left text-sm hover:bg-slate-50', danger ? 'text-red-600' : 'text-ink-700')} {...p}>{children}</button>;

// ---------- Tabs ----------
export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string; count?: number }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => <button key={t.key} onClick={() => onChange(t.key)} className={cx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', value === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-ink-900')}>{t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs">{t.count}</span>}</button>)}
    </div>
  );
}

// ---------- Table (responsive: cards on mobile) ----------
export interface Column<T> { key: string; header: string; render?: (row: T) => ReactNode; className?: string; hideOnMobile?: boolean }
export function DataTable<T extends { id?: number | string }>({ columns, rows, rowKey, onRowClick, empty, mobileTitle }: { columns: Column<T>[]; rows: T[]; rowKey?: (r: T) => string | number; onRowClick?: (r: T) => void; empty?: ReactNode; mobileTitle?: (r: T) => ReactNode }) {
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;
  const key = (r: T, i: number) => rowKey?.(r) ?? r.id ?? i;
  return (
    <>
      <div className="table-wrap hidden md:block"><table className="table"><thead><tr>{columns.map((c) => <th key={c.key} className={c.className}>{c.header}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={key(r, i)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={onRowClick ? 'cursor-pointer' : ''}>{columns.map((c) => <td key={c.key} className={c.className}>{c.render ? c.render(r) : String((r as any)[c.key] ?? '—')}</td>)}</tr>)}</tbody></table></div>
      <div className="space-y-3 md:hidden">{rows.map((r, i) => (
        <div key={key(r, i)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx('card p-4', onRowClick && 'cursor-pointer active:bg-slate-50')}>
          {mobileTitle && <div className="mb-2 font-medium">{mobileTitle(r)}</div>}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">{columns.filter((c) => !c.hideOnMobile).map((c) => <div key={c.key}><dt className="text-xs uppercase tracking-wide text-slate-400">{c.header}</dt><dd className="text-ink-900">{c.render ? c.render(r) : String((r as any)[c.key] ?? '—')}</dd></div>)}</dl>
        </div>))}</div>
    </>
  );
}
export function Pagination({ page, totalPages, total, onChange }: { page: number; totalPages: number; total: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return <p className="px-1 pt-3 text-xs text-slate-500">{total} record{total === 1 ? '' : 's'}</p>;
  return (
    <div className="flex items-center justify-between pt-3 text-sm"><span className="text-slate-500">Page {page} of {totalPages} · {total} records</span>
      <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</Button></div></div>
  );
}

// ---------- Page bits ----------
export function PageHeader({ title, description, actions, crumbs }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: { label: string; to?: string }[] }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {crumbs && <nav className="mb-1 text-xs text-slate-500">{crumbs.map((c, i) => <span key={i}>{i > 0 && ' / '}{c.to ? <a href={c.to} className="hover:text-brand-700">{c.label}</a> : c.label}</span>)}</nav>}
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export function StatCard({ label, value, hint, to }: { label: string; value: ReactNode; hint?: ReactNode; to?: string }) {
  const inner = <><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}</>;
  return to ? <a href={to} className="card block p-4 transition hover:border-brand-300">{inner}</a> : <div className="card p-4">{inner}</div>;
}
export function FileUpload({ onFile, accept, file, hint }: { onFile: (f: File | null) => void; accept?: string; file: File | null; hint?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm">
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      {file ? <div className="flex items-center justify-between gap-2"><span className="truncate">{file.name} <span className="text-slate-400">({Math.round(file.size / 1024)} KB)</span></span><Button size="sm" variant="ghost" type="button" onClick={() => { onFile(null); if (ref.current) ref.current.value = ''; }}>Remove</Button></div>
        : <button type="button" onClick={() => ref.current?.click()} className="text-brand-700 hover:underline">Choose a file</button>}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// ---------- Toast ----------
interface Toast { id: number; message: string; tone: 'success' | 'error' | 'info' }
const ToastCtx = createContext<{ toast: (message: string, tone?: Toast['tone']) => void }>({ toast: () => {} });
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const toast = (message: string, tone: Toast['tone'] = 'success') => { const id = Date.now() + Math.random(); setItems((t) => [...t, { id, message, tone }]); setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 4000); };
  return (
    <ToastCtx.Provider value={{ toast }}>{children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">{items.map((t) => <div key={t.id} role="status" className={cx('pointer-events-auto rounded-lg px-4 py-3 text-sm text-white shadow-lg', t.tone === 'error' ? 'bg-red-600' : t.tone === 'info' ? 'bg-ink-900' : 'bg-emerald-600')}>{t.message}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx).toast;

// ---------- Icons (inline, no dependency) ----------
const I = ({ d, className = 'h-5 w-5' }: { d: string; className?: string }) => <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
export const Icon = {
  X: (p: { className?: string }) => <I d="M18 6 6 18M6 6l12 12" {...p} />,
  Menu: (p: { className?: string }) => <I d="M4 6h16M4 12h16M4 18h16" {...p} />,
  Bell: (p: { className?: string }) => <I d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1" {...p} />,
  Inbox: (p: { className?: string }) => <I d="M3 13h5l2 3h4l2-3h5M5 6h14l2 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5l2-7Z" {...p} />,
  Home: (p: { className?: string }) => <I d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11Z" {...p} />,
  School: (p: { className?: string }) => <I d="M3 10 12 5l9 5-9 5-9-5Zm3 3v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" {...p} />,
  Users: (p: { className?: string }) => <I d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m22 0v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" {...p} />,
  User: (p: { className?: string }) => <I d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" {...p} />,
  Book: (p: { className?: string }) => <I d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z" {...p} />,
  Grid: (p: { className?: string }) => <I d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z" {...p} />,
  Calendar: (p: { className?: string }) => <I d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" {...p} />,
  Check: (p: { className?: string }) => <I d="M20 6 9 17l-5-5" {...p} />,
  Clipboard: (p: { className?: string }) => <I d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" {...p} />,
  Megaphone: (p: { className?: string }) => <I d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm12-3s2 1 2 4-2 4-2 4m3-11s3 2 3 7-3 7-3 7" {...p} />,
  Settings: (p: { className?: string }) => <I d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-1.7-1L14.8 3H9.2l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.4 7.4 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h5.6l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z" {...p} />,
  Shield: (p: { className?: string }) => <I d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" {...p} />,
  Chart: (p: { className?: string }) => <I d="M3 3v18h18M7 15l4-4 4 4 5-6" {...p} />,
  File: (p: { className?: string }) => <I d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6" {...p} />,
  Library: (p: { className?: string }) => <I d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 5l3.9 1-3.4 14-3.9-1z" {...p} />,
  Logout: (p: { className?: string }) => <I d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9" {...p} />,
  ArrowRight: (p: { className?: string }) => <I d="M5 12h14m-7-7 7 7-7 7" {...p} />,
  Search: (p: { className?: string }) => <I d="m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" {...p} />,
  Plus: (p: { className?: string }) => <I d="M12 5v14m-7-7h14" {...p} />,
  Layers: (p: { className?: string }) => <I d="m12 2 10 5-10 5L2 7l10-5Zm-10 10 10 5 10-5M2 17l10 5 10-5" {...p} />,
  Lock: (p: { className?: string }) => <I d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" {...p} />,
  Upload: (p: { className?: string }) => <I d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m14-8-5-5-5 5m5-5v12" {...p} />,
  Dot: (p: { className?: string }) => <svg className={p.className ?? 'h-2 w-2'} viewBox="0 0 8 8" fill="currentColor"><circle cx="4" cy="4" r="4" /></svg>,
};
