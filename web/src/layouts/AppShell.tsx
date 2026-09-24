import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { useQuery, fmtDateTime } from '@/lib/hooks';
import { Button, Dropdown, Icon, MenuItem, cx } from '@/components/ui';

export interface NavItem { to: string; label: string; icon: ReactNode; end?: boolean }
export interface NavGroup { title?: string; items: NavItem[] }

export function AppShell({ groups, brandSub }: { groups: NavGroup[]; brandSub: string }) {
  const { me, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);
  const notif = useQuery(() => api.get<{ items: any[]; unread: number }>('/api/notifications'), [loc.pathname]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-4"><Logo /><div><div className="text-sm font-semibold leading-tight">EduOS</div><div className="truncate text-xs text-slate-500">{brandSub}</div></div></div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((g, i) => (
          <div key={i}>{g.title && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.title}</p>}
            <div className="space-y-0.5">{g.items.map((it) => <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => cx('nav-link', isActive && 'active')}><span className="text-slate-400 [.active_&]:text-brand-700">{it.icon}</span>{it.label}</NavLink>)}</div>
          </div>))}
      </nav>
      <div className="border-t p-3 text-xs text-slate-500">{me?.school ? <><span className="font-medium text-ink-700">{me.school.name}</span><br />Code: {me.school.code}</> : 'Platform control plane'}</div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r bg-white lg:block lg:sticky lg:top-0 lg:h-screen">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 bg-ink-900/40 lg:hidden" onClick={() => setOpen(false)}><aside className="h-full w-72 bg-white" onClick={(e) => e.stopPropagation()}>{sidebar}</aside></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Icon.Menu /></button>
          <div className="hidden text-sm text-slate-500 lg:block">{me?.school?.name ?? 'EduOS Platform'}</div>
          <div className="flex items-center gap-2">
            <Dropdown trigger={<button className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications"><Icon.Bell />{!!notif.data?.unread && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{notif.data.unread}</span>}</button>}>
              <div className="w-80 max-w-[90vw]">
                <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Notifications{!!notif.data?.unread && <button className="font-medium normal-case text-brand-700" onClick={async (e) => { e.stopPropagation(); await api.post('/api/notifications/read-all'); notif.reload(); }}>Mark all read</button>}</div>
                <div className="max-h-80 overflow-y-auto">{notif.data?.items.length ? notif.data.items.map((n) => <button key={n.id} onClick={() => n.link && nav(n.link)} className={cx('block w-full border-t px-3 py-2 text-left text-sm hover:bg-slate-50', !n.read_at && 'bg-brand-50/40')}><div className="font-medium">{n.title}</div>{n.body && <div className="line-clamp-2 text-xs text-slate-500">{n.body}</div>}<div className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(n.created_at)}</div></button>) : <p className="px-3 py-6 text-center text-sm text-slate-400">You're all caught up.</p>}</div>
              </div>
            </Dropdown>
            <Dropdown trigger={<button className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-100"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{initials(me?.user.name)}</span><span className="hidden sm:block">{me?.user.name}</span></button>}>
              <div className="border-b px-3 py-2 text-xs text-slate-500">{me?.user.email}<br /><span className="font-medium text-ink-700">{me?.user.role.replace('_', ' ')}</span></div>
              <MenuItem onClick={() => nav('/account/password')}>Change password</MenuItem>
              <MenuItem danger onClick={async () => { await logout(); nav('/login'); }}>Sign out</MenuItem>
            </Dropdown>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl"><Outlet /></div></main>
      </div>
    </div>
  );
}
export const initials = (n?: string) => (n ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export const Logo = ({ className = 'h-8 w-8' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0f766e" /><path d="M8 11.5 16 8l8 3.5-8 3.5-8-3.5Z" fill="#fff" /><path d="M11 14.5v4.2c0 1.6 2.2 2.8 5 2.8s5-1.2 5-2.8v-4.2l-5 2.2-5-2.2Z" fill="#99f6e4" /></svg>
);
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 px-4 py-10">
      <a href="/" className="mb-6 flex items-center gap-2"><Logo /><span className="text-lg font-semibold">EduOS</span></a>
      <div className="card w-full max-w-md p-6 sm:p-8"><h1 className="text-xl font-semibold">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}<div className="mt-6">{children}</div></div>
      {footer && <p className="mt-4 text-sm text-slate-500">{footer}</p>}
    </div>
  );
}
export { Button };
