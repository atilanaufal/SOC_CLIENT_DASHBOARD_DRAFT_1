import { NextRequest, NextResponse } from 'next/server';
import { verifyUserCredentials } from '@/lib/mysql';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const usernameInput = body.username || body.email || '';
    const passwordInput = body.password || '';

    if (!usernameInput || !passwordInput) {
      return NextResponse.json(
        { success: false, error: 'Username/Email dan Password wajib diisi.' },
        { status: 400 }
      );
    }

    const authResult = await verifyUserCredentials(usernameInput, passwordInput);

    if (!authResult.success || !authResult.user) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Login gagal.' },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: 'Login berhasil',
      user: authResult.user,
    });

    // Store user session in HttpOnly cookie
    const sessionData = JSON.stringify(authResult.user);
    response.cookies.set('auth_session', sessionData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (err: any) {
    console.error('Login API error:', err);
    return NextResponse.json(
      { success: false, error: `Internal server error: ${err.message}` },
      { status: 500 }
    );
  }
}
