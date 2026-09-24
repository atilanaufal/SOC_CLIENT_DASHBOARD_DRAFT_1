import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const MAX_IDLE_SECONDS = 15 * 60; // 15 menit
const MAX_IDLE_MS = MAX_IDLE_SECONDS * 1000;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const clientSessionCookie = request.cookies.get('asoc_client_session')?.value;
  const legacyAuthSessionCookie = request.cookies.get('auth_session')?.value;
  const rawSessionCookie = clientSessionCookie || legacyAuthSessionCookie;

  let sessionUser: any = null;
  let isExpired = false;
  let isTenantUser = false;

  if (rawSessionCookie) {
    try {
      sessionUser = JSON.parse(decodeURIComponent(rawSessionCookie));
      const role = (sessionUser.role || '').toLowerCase();
      const dbName = sessionUser.database_name || sessionUser.databaseName || '';

      // BLOKIR JIKA INI AKUN ADMIN / SUPERADMIN ("ASOC Central Management" dari Admin Panel)
      if (role === 'admin' || role === 'superadmin' || dbName === '-' || dbName === '') {
        sessionUser = null;
        isTenantUser = false;
      } else {
        isTenantUser = true;
        const lastActive = Number(sessionUser.last_active);
        if (lastActive && Date.now() - lastActive > MAX_IDLE_MS) {
          isExpired = true;
        }
      }
    } catch {
      isExpired = true;
      sessionUser = null;
    }
  }

  // Wajib memiliki session tenant yang valid dan belum expired
  const isAuthenticated = Boolean(sessionUser) && isTenantUser && !isExpired;

  const clearSessionCookies = (res: NextResponse) => {
    const isHttps = process.env.BETTER_AUTH_URL?.startsWith('https://') ?? false;
    const cookieNames = [
      'asoc_client_session',
      'auth_session',
      'better-auth.session_token',
      '__Secure-better-auth.session_token',
      'better-auth.session_data',
    ];
    cookieNames.forEach((name) => {
      res.cookies.set(name, '', {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
    });
  };

  const setRollingSession = (res: NextResponse) => {
    if (sessionUser && isTenantUser) {
      sessionUser.last_active = Date.now();
      const proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol || '';
      const isHttps = proto.includes('https') || (process.env.BETTER_AUTH_URL?.startsWith('https://') ?? false);
      const cookiePayload = JSON.stringify(sessionUser);
      const cookieOpts = {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax' as const,
        path: '/',
        maxAge: MAX_IDLE_SECONDS, // 15 menit
      };
      res.cookies.set('asoc_client_session', cookiePayload, cookieOpts);
      res.cookies.set('auth_session', cookiePayload, cookieOpts);
    }
  };

  // 1. Root path `/`
  if (pathname === '/') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      const res = NextResponse.redirect(new URL('/login', request.url));
      if (isExpired || (rawSessionCookie && !isTenantUser)) clearSessionCookies(res);
      return res;
    }
  }

  // 2. `/login` page
  if (pathname === '/login') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    const res = NextResponse.next();
    if (isExpired || (rawSessionCookie && !isTenantUser)) clearSessionCookies(res);
    return res;
  }

  // 3. Protected Dashboard Pages (pindah halaman / refresh)
  const isProtectedPage =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/incidents') ||
    pathname.startsWith('/devices') ||
    pathname.startsWith('/vulnerabilities') ||
    pathname.startsWith('/reports');

  if (isProtectedPage) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      if (isExpired) {
        loginUrl.searchParams.set('expired', '1');
      }
      const res = NextResponse.redirect(loginUrl);
      clearSessionCookies(res);
      return res;
    }

    // Jika aktif: perbarui timestamp last_active dan perpanjang masa berlaku cookie (rolling session 15 menit)
    const res = NextResponse.next();
    setRollingSession(res);
    return res;
  }

  // 4. Protected API Endpoints (exclude auth endpoints)
  const isProtectedApi =
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth');

  if (isProtectedApi) {
    if (!isAuthenticated) {
      const res = NextResponse.json(
        {
          success: false,
          error: 'Unauthorized. Sesi telah berakhir karena tidak ada aktivitas selama 15 menit.',
          code: 'SESSION_EXPIRED',
        },
        { status: 401 }
      );
      clearSessionCookies(res);
      return res;
    }

    // Perpanjang sesi pada request API
    const res = NextResponse.next();
    setRollingSession(res);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (e.g. infoguard.png, tguard.png, svg, jpg)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
