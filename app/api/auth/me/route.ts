import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant-context';
import { signSessionToken, SESSION_COOKIE_NAME, LEGACY_COOKIE_NAMES } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // 1. Authoritative server-side tenant and cryptographic session validation
    const tenant = await getTenantContext(req);

    const isProduction = process.env.NODE_ENV === 'production';

    const clearCookies = (res: NextResponse) => {
      [SESSION_COOKIE_NAME, ...LEGACY_COOKIE_NAMES].forEach((name) => {
        res.cookies.set(name, '', {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'lax',
          path: '/',
          maxAge: 0,
        });
      });
    };

    if (!tenant) {
      const res = NextResponse.json(
        { success: false, authenticated: false, message: 'Sesi tidak valid atau telah berakhir.' },
        { status: 401 }
      );
      clearCookies(res);
      return res;
    }

    // 2. Return sanitized user presentation DTO (Minimal exposure: no internal IDs or unused fields)
    const response = NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        username: tenant.username,
        role: tenant.role || 'tenant',
        tenant_code: tenant.tenantCode,
        campus_name: tenant.campusName,
      },
    });

    // 3. Rolling session refresh with newly signed token (bounded by 12h absolute ceiling)
    if (tenant.sessionId) {
      const now = Date.now();
      const expiresAt = tenant.expiresAt || (now + 12 * 60 * 60 * 1000);
      const updatedToken = await signSessionToken({
        sessionId: tenant.sessionId,
        userId: tenant.userId,
        username: tenant.username,
        role: tenant.role || 'tenant',
        issuedAt: now,
        lastActive: now,
        expiresAt: expiresAt,
      });

      const cookieOpts = {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax' as const,
        path: '/',
      };

      response.cookies.set(SESSION_COOKIE_NAME, updatedToken, cookieOpts);
      for (const legacyName of LEGACY_COOKIE_NAMES) {
        response.cookies.set(legacyName, '', { path: '/', maxAge: 0 });
      }
    }

    return response;
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        message: 'Sesi tidak valid.',
      },
      { status: 401 }
    );
  }
}
