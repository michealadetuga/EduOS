import type { Role, Permission } from './rbac.js';

/** Server-owned request context; never derived from client-supplied identifiers. */
export interface TenantContext {
  userId: number;
  role: Role;
  schoolId: number | null; // null only for SUPER_ADMIN
  sessionId: number;
  email: string;
  name: string;
  mustChangePassword: boolean;
  /** Set only for super admin support access to a school, after logging the reason. */
  supportSchoolId?: number;
}

declare global {
  namespace Express {
    interface Request {
      ctx?: TenantContext;
      /** Convenience: effective tenant id for school-scoped modules. */
      schoolId: number;
      perms?: Set<Permission>;
    }
  }
}
export {};
