<<<<<<< Updated upstream
=======
import { auth } from './auth';

>>>>>>> Stashed changes
export interface TenantContext {
  userId: number | string;
  username: string;
  email: string | null;
  tenantId: number;
  tenantCode: string;
  campusName: string;
  databaseName: string;
  redisPrefix: string;
  role?: string;
}

<<<<<<< Updated upstream
export function getTenantContext(request: Request): TenantContext {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    
    // 1. Try reading auth_session cookie
    const match = cookieHeader.match(/auth_session=([^;]+)/);
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1]);
      const user = JSON.parse(decoded);
      return {
        userId: user.id || 1,
        username: user.username || user.name || 'user',
        email: user.email || null,
        tenantId: Number(user.tenant_id || user.tenantId) || 1,
        tenantCode: user.tenant_code || user.tenantCode || 'UI',
        campusName: user.campus_name || user.campusName || 'Universitas Indonesia',
        databaseName: user.database_name || user.databaseName || 'universitas_indonesia',
        redisPrefix: user.redis_prefix || user.redisPrefix || 'universitas_indonesia',
        role: user.role || 'tenant',
      };
    }
  } catch (err) {
    // ignore parse error
  }

  // Fallback default (Universitas Indonesia)
  return {
    userId: 1,
    username: 'user_ui',
    email: 'soc@ui.ac.id',
    tenantId: 1,
    tenantCode: 'UI',
    campusName: 'Universitas Indonesia',
    databaseName: 'universitas_indonesia',
    redisPrefix: 'universitas_indonesia',
    role: 'tenant',
  };
=======
/**
 * Server-side validated tenant context resolution.
 * Verifies session cryptographically against Better Auth session store.
 * Returns null if no valid session is present (Strict Multi-Tenancy Isolation).
 * Does NOT provide hardcoded fallback tenant names.
 */
export async function getTenantContext(request: Request): Promise<TenantContext | null> {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (session && session.user) {
      const user = session.user as any;
      const databaseName = user.databaseName || user.database_name || '';
      const redisPrefix = user.redisPrefix || user.redis_prefix || databaseName;

      // If user has no associated database, tenant context cannot be resolved safely
      if (!databaseName) {
        console.warn(`[TenantContext] User ${user.username || user.id} does not have an assigned tenant database.`);
        return null;
      }

      return {
        userId: user.id,
        username: user.username || user.name || '',
        email: user.email || null,
        tenantId: Number(user.tenantId || user.tenant_id) || 0,
        tenantCode: user.tenantCode || user.tenant_code || '',
        campusName: user.campusName || user.campus_name || '',
        databaseName: databaseName,
        redisPrefix: redisPrefix,
        role: user.role || 'tenant',
      };
    }
  } catch (err: any) {
    console.error('[TenantContext] Session validation error:', err.message);
  }

  // Strictly return null if unauthenticated or tenant is unassigned (NO hardcoded fallback)
  return null;
>>>>>>> Stashed changes
}
