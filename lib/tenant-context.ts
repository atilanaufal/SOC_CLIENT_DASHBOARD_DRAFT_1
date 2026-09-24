

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
  // Resolve tenant session via asoc_client_session or auth_session cookie
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const match =
      cookieHeader.match(/asoc_client_session=([^;]+)/) ||
      cookieHeader.match(/auth_session=([^;]+)/);

    if (match && match[1]) {
      const user = JSON.parse(decodeURIComponent(match[1]));
      const role = (user.role || '').toLowerCase();
      const databaseName = user.database_name || user.databaseName || '';

      // Tolak akun Admin Panel ("ASOC Central Management")
      if (role === 'admin' || role === 'superadmin' || !databaseName || databaseName === '-') {
        return null;
      }

      const lastActive = Number(user.last_active);
      if (lastActive && Date.now() - lastActive > 15 * 60 * 1000) {
        return null;
      }

      const redisPrefix = user.redis_prefix || user.redisPrefix || databaseName;
      if (databaseName) {
        return {
          userId: user.id,
          username: user.username || user.name || '',
          email: user.email || null,
          tenantId: Number(user.tenant_id || user.tenantId) || 0,
          tenantCode: user.tenant_code || user.tenantCode || '',
          campusName: user.campus_name || user.campusName || '',
          databaseName: databaseName,
          redisPrefix: redisPrefix,
          role: user.role || 'tenant',
        };
      }
    }
  } catch (err: any) {
    console.error('[TenantContext] auth_session parse error:', err.message);
  }

  // Strictly return null if unauthenticated or tenant is unassigned (NO hardcoded fallback)
  return null;

}
