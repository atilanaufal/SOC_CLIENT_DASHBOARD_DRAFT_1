import { NextRequest, NextResponse } from 'next/server';
import { auth, syncMasterUserToBetterAuth } from '@/lib/auth';
<<<<<<< Updated upstream
=======
import { rateLimit, resetRateLimit } from '@/lib/rate-limit';
>>>>>>> Stashed changes

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

<<<<<<< Updated upstream
    // 1. Sync & verify user credentials with master database & Better Auth
    const syncRes = await syncMasterUserToBetterAuth(usernameInput, passwordInput);
    if (!syncRes.success || !syncRes.user) {
      return NextResponse.json(
=======
    // Rate Limiting: Max 5 failed attempts per 15 minutes per IP & Identifier
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const rateLimitKey = `login:${clientIp}:${usernameInput.toLowerCase()}`;

    const limitCheck = await rateLimit(rateLimitKey, 5, 15 * 60);
    if (!limitCheck.allowed) {
      const waitMinutes = Math.ceil((limitCheck.resetTimeMs - Date.now()) / (60 * 1000));
      return NextResponse.json(
        {
          success: false,
          error: `Terlalu banyak percobaan login yang gagal. Akun/IP dibatasi demi keamanan. Silakan coba kembali dalam ${waitMinutes} menit.`,
        },
        { status: 429 }
      );
    }

    // 1. Sync & verify user credentials with master database & Better Auth
    const syncRes = await syncMasterUserToBetterAuth(usernameInput, passwordInput);
    if (!syncRes.success || !syncRes.user) {
      return NextResponse.json(
>>>>>>> Stashed changes
        { success: false, error: syncRes.error || 'Login gagal. Periksa username dan password Anda.' },
        { status: 401 }
      );
    }

<<<<<<< Updated upstream
=======
    // Reset rate limit on successful verification
    await resetRateLimit(rateLimitKey);

>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        tenant_code: masterUser.tenant_code || 'UI',
        campus_name: masterUser.campus_name || 'Universitas Indonesia',
        database_name: masterUser.database_name || 'universitas_indonesia',
        redis_prefix: masterUser.redis_prefix || 'universitas_indonesia',
=======
        tenant_code: masterUser.tenant_code || '',
        campus_name: masterUser.campus_name || '',
        database_name: masterUser.database_name || '',
        redis_prefix: masterUser.redis_prefix || masterUser.database_name || '',
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream

    // Set fallback auth_session cookie
    response.cookies.set('auth_session', JSON.stringify(masterUser), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
=======
>>>>>>> Stashed changes

    return response;
  } catch (err: any) {
    console.error('Login API error:', err);
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Terjadi kesalahan sistem saat memproses login.'
          : `Internal server error: ${err.message}`,
      },
      { status: 500 }
    );
  }
}
