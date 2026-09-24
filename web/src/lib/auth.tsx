import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api } from './api';

export type Role = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT';
export interface Me {
  user: { id: number; name: string; email: string; role: Role; mustChangePassword: boolean };
  permissions: string[];
  school: { id: number; code: string; name: string; logo_key: string | null; status: string; onboarding_complete: number; onboarding_step: number } | null;
  profile: any;
}
interface AuthCtx { me: Me | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void>; can: (p: string) => boolean }
const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try { setMe(await api.get<Me>('/api/auth/me')); } catch { setMe(null); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const logout = useCallback(async () => { await api.post('/api/auth/logout'); setMe(null); }, []);
  const can = useCallback((p: string) => !!me?.permissions.includes(p), [me]);
  return <Ctx.Provider value={{ me, loading, refresh, logout, can }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

export const homeFor = (role?: Role) =>
  role === 'SUPER_ADMIN' ? '/platform' : role === 'SCHOOL_ADMIN' ? '/admin' : role === 'TEACHER' ? '/teacher' : role === 'STUDENT' ? '/student' : role === 'PARENT' ? '/parent' : '/login';

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="flex h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!roles.includes(me.user.role)) return <Navigate to={homeFor(me.user.role)} replace />;
  if (me.user.mustChangePassword && loc.pathname !== '/account/password') return <Navigate to="/account/password" replace />;
  return <>{children}</>;
}
