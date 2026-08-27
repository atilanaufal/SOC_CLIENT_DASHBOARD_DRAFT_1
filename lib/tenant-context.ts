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
}
