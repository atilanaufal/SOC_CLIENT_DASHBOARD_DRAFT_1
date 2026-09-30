import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  verifySessionToken,
  signSessionToken,
  SESSION_COOKIE_NAME,
  LEGACY_COOKIE_NAMES,
  SessionPayload,
} from '@/lib/session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const cookieHeader = request.headers.get('cookie') || '';
  let token: string | null = null;

  // 1. Try primary signed session cookie
  const primaryCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (primaryCookie) {
    token = primaryCookie;
  } else {
    // 2. Check legacy cookies if they contain signed tokens
    for (const name of LEGACY_COOKIE_NAMES) {
      const val = request.cookies.get(name)?.value;
      if (val && val.includes('.')) {
        token = val;
        break;
      }
    }
  }

  // 3. Cryptographically verify signature and server-enforced idle expiration
  const sessionPayload: SessionPayload | null = await verifySessionToken(token);

  let isAuthenticated = false;
  let isTenantUser = false;

  if (sessionPayload) {
    const role = (sessionPayload.role || 'tenant').toLowerCase();
    // Deny admin / superadmin accounts from accessing client tenant dashboard
    if (role !== 'admin' && role !== 'superadmin') {
      isAuthenticated = true;
      isTenantUser = true;
    }
  }

  const isHttps =
    request.headers.get('x-forwarded-proto') === 'https' ||
    request.nextUrl.protocol === 'https:' ||
    (process.env.BETTER_AUTH_URL?.startsWith('https://') ?? false);

  const clearSessionCookies = (res: NextResponse) => {
    const allCookieNames = [
      SESSION_COOKIE_NAME,
      ...LEGACY_COOKIE_NAMES,
      'better-auth.session_token',
      '__Secure-better-auth.session_token',
      'better-auth.session_data',
    ];
    allCookieNames.forEach((name) => {
      res.cookies.set(name, '', {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
    });
  };

  const setRollingSession = async (res: NextResponse) => {
    if (sessionPayload && isTenantUser) {
      // Re-sign updated payload with server timestamp
      const updatedPayload: SessionPayload = {
        ...sessionPayload,
        lastActive: Date.now(),
      };
      const signedToken = await signSessionToken(updatedPayload);

      // Session-only cookie (cleared when browser closes)
      res.cookies.set(SESSION_COOKIE_NAME, signedToken, {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/',
      });

      // Clear legacy insecure plaintext cookies
      for (const legacyName of LEGACY_COOKIE_NAMES) {
        if (request.cookies.has(legacyName)) {
          res.cookies.set(legacyName, '', { path: '/', maxAge: 0 });
        }
      }
    }
  };

  // 1. Root path `/`
  if (pathname === '/') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      const res = NextResponse.redirect(new URL('/login', request.url));
      if (token && !isAuthenticated) clearSessionCookies(res);
      return res;
    }
  }

  // 2. `/login` page
  if (pathname === '/login') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    const res = NextResponse.next();
    if (token && !isAuthenticated) clearSessionCookies(res);
    return res;
  }

  // 3. Protected Dashboard Pages
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
      if (token) {
        loginUrl.searchParams.set('expired', '1');
      }
      const res = NextResponse.redirect(loginUrl);
      clearSessionCookies(res);
      return res;
    }

    const res = NextResponse.next();
    await setRollingSession(res);
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
          error: 'Unauthorized. Sesi tidak valid atau telah berakhir.',
          code: 'SESSION_EXPIRED',
        },
        { status: 401 }
      );
      clearSessionCookies(res);
      return res;
    }

    const res = NextResponse.next();
    await setRollingSession(res);
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
     * - public files (e.g. svg, png, jpg, jpeg, gif, webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
