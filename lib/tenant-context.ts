import { verifySessionToken, SESSION_COOKIE_NAME, LEGACY_COOKIE_NAMES } from './session';
import { getServerSession, touchServerSession } from './session-store';
import { getAuthoritativeTenantByUserId } from './mysql';

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
  sessionId?: string;
}

/**
 * Server-side authoritative tenant context resolution.
 * - Extracts and cryptographically verifies signed session token (HMAC-SHA256).
 * - Verifies session liveness in server-side session registry (Redis).
 * - Enforces strict server-side idle timeout (15 minutes).
 * - Resolves tenant assignment, database name, and Redis prefix EXCLUSIVELY from master MySQL database.
 * - Completely ignores and rejects any client-supplied tenant_id or database_name (blocks BOLA/IDOR).
 * - Returns null if unauthenticated, tampered, expired, or unauthorized.
 */
export async function getTenantContext(request: Request): Promise<TenantContext | null> {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    if (!cookieHeader) return null;

    // Search for authoritative signed session token
    let token: string | null = null;

    // 1. Check primary asoc_session cookie
    const primaryMatch = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
    if (primaryMatch && primaryMatch[1]) {
      token = decodeURIComponent(primaryMatch[1]);
    }

    // 2. Check legacy cookies if they contain signed tokens
    if (!token) {
      for (const name of LEGACY_COOKIE_NAMES) {
        const legacyMatch = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
        if (legacyMatch && legacyMatch[1]) {
          const val = decodeURIComponent(legacyMatch[1]);
          if (val.includes('.')) {
            token = val;
            break;
          }
        }
      }
    }

    if (!token) return null;

    // 3. Verify cryptographic integrity & timeout via HMAC-SHA256
    const payload = await verifySessionToken(token);
    if (!payload || !payload.userId || !payload.sessionId) {
      return null;
    }

    // 4. Verify session liveness in server-side registry (Redis)
    const serverSession = await getServerSession(payload.sessionId);
    if (!serverSession) {
      // Session has been revoked or expired on server
      return null;
    }

    // Refresh server-side session activity timestamp
    touchServerSession(payload.sessionId).catch(() => {});

    // 5. Query authoritative tenant assignment from master MySQL database
    const authoritativeTenant = await getAuthoritativeTenantByUserId(payload.userId);
    if (!authoritativeTenant) {
      return null;
    }

    return {
      userId: authoritativeTenant.userId,
      username: authoritativeTenant.username,
      email: authoritativeTenant.email,
      tenantId: authoritativeTenant.tenantId,
      tenantCode: authoritativeTenant.tenantCode,
      campusName: authoritativeTenant.campusName,
      databaseName: authoritativeTenant.databaseName,
      redisPrefix: authoritativeTenant.redisPrefix,
      role: authoritativeTenant.role,
      sessionId: payload.sessionId,
    };
  } catch (err: any) {
    console.error('[TenantContext] Resolution error:', err.message);
    return null;
  }
}
