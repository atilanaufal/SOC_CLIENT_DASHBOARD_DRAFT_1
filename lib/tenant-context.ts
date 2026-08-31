
import { auth } from './auth';


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

}
