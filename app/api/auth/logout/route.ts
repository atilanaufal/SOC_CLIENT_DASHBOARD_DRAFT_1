import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    // 1. Sign out on Better Auth server
    try {
      await auth.api.signOut({
        headers: req.headers,
      });
    } catch {}

    const response = NextResponse.json({
      success: true,
      message: 'Logout berhasil',
    });

    // 2. Clear all session cookies
    const cookieNames = [
      'better-auth.session_token',
      '__Secure-better-auth.session_token',
      'better-auth.session_data',
      'auth_session',
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
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
