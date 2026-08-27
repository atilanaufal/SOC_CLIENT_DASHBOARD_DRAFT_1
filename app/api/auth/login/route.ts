import { NextRequest, NextResponse } from 'next/server';
import { auth, syncMasterUserToBetterAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const usernameInput = (body.username || body.email || '').trim();
    const passwordInput = (body.password || '').trim();

    if (!usernameInput || !passwordInput) {
      return NextResponse.json(
        { success: false, error: 'Username/Email dan Password wajib diisi.' },
        { status: 400 }
      );
    }

    // 1. Sync & verify user credentials with master database & Better Auth
    const syncRes = await syncMasterUserToBetterAuth(usernameInput, passwordInput);
    if (!syncRes.success || !syncRes.user) {
      return NextResponse.json(
        { success: false, error: syncRes.error || 'Login gagal. Periksa username dan password Anda.' },
        { status: 401 }
      );
    }

    const masterUser = syncRes.user;

    // 2. Perform Better Auth sign-in
    let baResponse: Response;
    try {
      if (usernameInput.includes('@')) {
        baResponse = await auth.api.signInEmail({
          body: {
            email: usernameInput,
            password: passwordInput,
          },
          asResponse: true,
        });
      } else {
        baResponse = await auth.api.signInUsername({
          body: {
            username: usernameInput,
            password: passwordInput,
          },
          asResponse: true,
        });
      }
    } catch (baErr: any) {
      console.warn('Better Auth signIn direct call failed, falling back:', baErr.message);
      baResponse = new Response(JSON.stringify({ error: baErr.message }), { status: 401 });
    }

    const response = NextResponse.json({
      success: true,
      message: 'Login berhasil',
      user: {
        id: masterUser.id,
        tenant_id: masterUser.tenant_id,
        username: masterUser.username,
        email: masterUser.email,
        role: masterUser.role,
        tenant_code: masterUser.tenant_code || 'UI',
        campus_name: masterUser.campus_name || 'Universitas Indonesia',
        database_name: masterUser.database_name || 'universitas_indonesia',
        redis_prefix: masterUser.redis_prefix || 'universitas_indonesia',
      },
    });

    // Forward all Set-Cookie headers from Better Auth
    const setCookieHeaders = baResponse.headers.getSetCookie?.() || [];
    if (setCookieHeaders.length > 0) {
      setCookieHeaders.forEach((cookieStr) => {
        response.headers.append('set-cookie', cookieStr);
      });
    } else {
      const singleSetCookie = baResponse.headers.get('set-cookie');
      if (singleSetCookie) {
        response.headers.set('set-cookie', singleSetCookie);
      }
    }

    // Set fallback auth_session cookie
    response.cookies.set('auth_session', JSON.stringify(masterUser), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
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
