import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant-context';
import { signSessionToken, SESSION_COOKIE_NAME, LEGACY_COOKIE_NAMES } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // 1. Authoritative server-side tenant and cryptographic session validation
    const tenant = await getTenantContext(req);

    const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol || '';
    const isHttps = proto.includes('https') || (process.env.BETTER_AUTH_URL?.startsWith('https://') ?? false);

    const clearCookies = (res: NextResponse) => {
      [SESSION_COOKIE_NAME, ...LEGACY_COOKIE_NAMES].forEach((name) => {
        res.cookies.set(name, '', {
          httpOnly: true,
          secure: isHttps,
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

    // 2. Return sanitized user presentation DTO (ASOC-F3: NO database_name or redis_prefix)
    const response = NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        id: tenant.userId,
        tenant_id: tenant.tenantId,
        username: tenant.username,
        email: tenant.email,
        role: tenant.role || 'tenant',
        tenant_code: tenant.tenantCode,
        campus_name: tenant.campusName,
      },
    });

    // 3. Rolling session refresh with newly signed token
    if (tenant.sessionId) {
      const updatedToken = await signSessionToken({
        sessionId: tenant.sessionId,
        userId: tenant.userId,
        username: tenant.username,
        role: tenant.role || 'tenant',
        issuedAt: Date.now(),
        lastActive: Date.now(),
      });

      const cookieOpts = {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax' as const,
        path: '/',
      };

      response.cookies.set(SESSION_COOKIE_NAME, updatedToken, cookieOpts);
      for (const legacyName of LEGACY_COOKIE_NAMES) {
        response.cookies.set(legacyName, updatedToken, cookieOpts);
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
