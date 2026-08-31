import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Optimistic & high-performance session cookie check for Edge / Middleware runtime
  const sessionToken =
    request.cookies.get('better-auth.session_token')?.value ||
    request.cookies.get('__Secure-better-auth.session_token')?.value ||
    request.cookies.get('auth_session')?.value;

  const isAuthenticated = Boolean(sessionToken);

  // 1. If user is at root `/`, redirect appropriately
  if (pathname === '/') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    } else {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // 2. If user is already authenticated and visits `/login`, redirect to `/dashboard`
  if (pathname === '/login') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // 3. Protected Dashboard Pages
  const isProtectedPage =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/incidents') ||
    pathname.startsWith('/devices') ||
    pathname.startsWith('/vulnerabilities') ||
    pathname.startsWith('/reports');

  if (isProtectedPage && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Protected API Endpoints (exclude auth endpoints)
  const isProtectedApi =
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth');

  if (isProtectedApi && !isAuthenticated) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized. Akses ditolak karena tidak ada sesi aktif.',
      },
      { status: 401 }
    );
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
