import { NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME, LEGACY_COOKIE_NAMES } from './session';
import { getServerSession, touchServerSession, getSessionRevocationReason } from './session-store';
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
  expiresAt?: number;
}

export type AuthErrorCode = 'CONCURRENT_LOGIN' | 'SESSION_EXPIRED' | 'UNAUTHORIZED';

export interface TenantContextResult {
  tenant: TenantContext | null;
  error?: AuthErrorCode;
}

/**
 * Server-side authoritative tenant context resolution with explicit error code detection.
 * - Extracts and cryptographically verifies signed session token (HMAC-SHA256).
 * - Verifies session liveness in server-side session registry (Redis).
 * - Distinguishes between normal expiration vs concurrent login kickout.
 * - Resolves tenant assignment, database name, and Redis prefix EXCLUSIVELY from master MySQL database.
 * - Fails closed on any inconsistency.
 */
export async function getTenantContextWithStatus(request: Request): Promise<TenantContextResult> {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    if (!cookieHeader) return { tenant: null, error: 'UNAUTHORIZED' };

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

    if (!token) return { tenant: null, error: 'UNAUTHORIZED' };

    // 3. Verify cryptographic integrity & timeout via HMAC-SHA256
    const payload = await verifySessionToken(token);
    if (!payload || !payload.userId || !payload.sessionId) {
      return { tenant: null, error: 'SESSION_EXPIRED' };
    }

    // 4. Verify session liveness in server-side registry (Redis)
    const serverSession = await getServerSession(payload.sessionId);
    if (!serverSession) {
      // Check if session was revoked due to single session enforcement (concurrent login)
      const revocationReason = await getSessionRevocationReason(payload.sessionId);
      if (revocationReason === 'CONCURRENT_LOGIN') {
        return { tenant: null, error: 'CONCURRENT_LOGIN' };
      }
      return { tenant: null, error: 'SESSION_EXPIRED' };
    }

    // Refresh server-side session activity timestamp
    touchServerSession(payload.sessionId).catch(() => {});

    // 5. Query authoritative tenant assignment from master MySQL database
    const authoritativeTenant = await getAuthoritativeTenantByUserId(payload.userId);
    if (!authoritativeTenant) {
      return { tenant: null, error: 'UNAUTHORIZED' };
    }

    return {
      tenant: {
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
        expiresAt: payload.expiresAt || (payload.issuedAt ? payload.issuedAt + 12 * 60 * 60 * 1000 : undefined),
      },
    };
  } catch (err: any) {
    console.error('[TenantContext] Resolution error:', err.message);
    return { tenant: null, error: 'UNAUTHORIZED' };
  }
}

/**
 * Standard getTenantContext backward-compatible wrapper
 */
export async function getTenantContext(request: Request): Promise<TenantContext | null> {
  const { tenant } = await getTenantContextWithStatus(request);
  return tenant;
}

/**
 * Creates standardized 401 response with proper concurrent login headers and message
 */
export function createAuthErrorResponse(errorCode?: AuthErrorCode) {
  const isConcurrent = errorCode === 'CONCURRENT_LOGIN';
  const response = NextResponse.json(
    {
      success: false,
      authenticated: false,
      error: isConcurrent
        ? 'Another user has logged into this account. You have been logged out.'
        : 'Unauthorized: Sesi autentikasi tidak valid atau telah berakhir.',
      code: isConcurrent ? 'CONCURRENT_LOGIN' : 'SESSION_EXPIRED',
    },
    { status: 401 }
  );

  if (isConcurrent) {
    response.headers.set('X-Auth-Reason', 'concurrent_login');
  }

  return response;
}
