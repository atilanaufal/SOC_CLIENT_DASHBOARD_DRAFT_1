import { NextRequest, NextResponse } from 'next/server';
import { syncMasterUserToBetterAuth } from '@/lib/auth';

import { rateLimit, resetRateLimit } from '@/lib/rate-limit';


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

        { success: false, error: syncRes.error || 'Login gagal. Periksa username dan password Anda.' },
        { status: 401 }
      );
    }


    // Reset rate limit on successful verification
    await resetRateLimit(rateLimitKey);


    const masterUser = syncRes.user;

    const response = NextResponse.json({
      success: true,
      message: 'Login berhasil',
      user: {
        id: masterUser.id,
        tenant_id: masterUser.tenant_id,
        username: masterUser.username,
        email: masterUser.email,
        role: masterUser.role,
        tenant_code: masterUser.tenant_code || '',
        campus_name: masterUser.campus_name || '',
        database_name: masterUser.database_name || '',
        redis_prefix: masterUser.redis_prefix || masterUser.database_name || '',
      },
    });

    const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol || '';
    const isHttps = proto.includes('https') || (process.env.BETTER_AUTH_URL?.startsWith('https://') ?? false);

    // Set fallback auth_session cookie
    response.cookies.set('auth_session', JSON.stringify(masterUser), {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

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
