import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME, LEGACY_COOKIE_NAMES } from '@/lib/session';
import { revokeServerSession } from '@/lib/session-store';

export async function POST(req: NextRequest) {
  try {
    // 1. Extract and revoke server session in Redis
    const token =
      req.cookies.get(SESSION_COOKIE_NAME)?.value ||
      req.cookies.get('auth_session')?.value ||
      req.cookies.get('asoc_client_session')?.value;

    if (token) {
      // Decode even if expired so server registry is purged immediately
      try {
        const payload = await verifySessionToken(token, Infinity);
        if (payload?.sessionId) {
          await revokeServerSession(payload.sessionId);
        }
      } catch {}
    }

    const response = NextResponse.json({
      success: true,
      message: 'Logout berhasil',
    });

    // 2. Clear all session cookies
    const cookieNames = [
      SESSION_COOKIE_NAME,
      ...LEGACY_COOKIE_NAMES,
      'better-auth.session_token',
      '__Secure-better-auth.session_token',
      'better-auth.session_data',
    ];

    const isHttps = process.env.BETTER_AUTH_URL?.startsWith('https://') ?? false;

    cookieNames.forEach((name) => {
      response.cookies.set(name, '', {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
    });

    return response;
  } catch (err: any) {
    console.error('Logout error:', err);
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan saat logout.' },
      { status: 500 }
    );
  }
}
