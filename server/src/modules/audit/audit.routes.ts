import { Router } from 'express';
import { asyncHandler, pagination } from '../../core/http.js';
import { requirePermission, requireTenant } from '../../core/auth.middleware.js';
import { paged } from '../../core/tenantRepo.js';

export const auditRouter = Router();
auditRouter.use(requireTenant, requirePermission('audit.view'));

auditRouter.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize } = pagination(req.query as any);
  const params: unknown[] = [req.schoolId]; let where = 'WHERE a.school_id = ?';
  if (req.query.action) { where += ' AND a.action LIKE ?'; params.push(`%${req.query.action}%`); }
  if (req.query.entityType) { where += ' AND a.entity_type = ?'; params.push(String(req.query.entityType)); }
  const sql = `SELECT a.*, u.first_name || ' ' || u.last_name AS actor, u.role AS actor_role FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id ${where} ORDER BY a.id DESC`;
  res.json(paged(sql, `SELECT COUNT(*) c FROM audit_logs a ${where}`, params, page, pageSize));
}));
