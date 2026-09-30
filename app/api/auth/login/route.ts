import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { syncMasterUserToBetterAuth } from '@/lib/auth';
import { rateLimit, resetRateLimit } from '@/lib/rate-limit';
import { signSessionToken, SESSION_COOKIE_NAME, LEGACY_COOKIE_NAMES } from '@/lib/session';
import { createServerSession } from '@/lib/session-store';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const usernameInput = (body.username || body.email || '').trim();
    const passwordInput = (body.password || '').trim();

    if (!usernameInput || !passwordInput) {
      return NextResponse.json(
        { success: false, error: 'Username dan Password wajib diisi.' },
        { status: 400 }
      );
    }

    // Rate Limiting: Trust X-Real-IP set by Nginx reverse proxy to prevent X-Forwarded-For spoofing
    const clientIp =
      req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
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

    // 1. Sync & verify user credentials with master database (MySQL Argon2id / bcrypt)
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
    const role = (masterUser.role || '').toLowerCase();
    const dbName = masterUser.database_name || '';

    // Validasi ketat: dashboard ini khusus Tenant
    if (role === 'admin' || role === 'superadmin' || !dbName || dbName === '-') {
      return NextResponse.json(
        {
          success: false,
          error: 'Akses ditolak. Dashboard ini khusus untuk akun Tenant. Akun Administrator silakan masuk melalui Admin Panel.',
        },
        { status: 403 }
      );
    }

    const now = Date.now();
    const sessionId = crypto.randomUUID();

    // 2. Create authoritative server-side session in Redis with 15-minute inactivity TTL
    await createServerSession(
      sessionId,
      {
        sessionId,
        userId: masterUser.id,
        username: masterUser.username,
        role: masterUser.role || 'tenant',
        createdAt: now,
        lastActive: now,
      },
      15 * 60 // 15 minutes TTL
    );

    // 3. Issue cryptographically signed session token (HMAC-SHA256)
    const signedToken = await signSessionToken({
      sessionId,
      userId: masterUser.id,
      username: masterUser.username,
      role: masterUser.role || 'tenant',
      issuedAt: now,
      lastActive: now,
    });

    // 4. Return sanitized user presentation DTO (ASOC-F3: NO database_name or redis_prefix)
    const response = NextResponse.json({
      success: true,
      message: 'Login berhasil',
      user: {
        id: masterUser.id,
        tenant_id: masterUser.tenant_id,
        username: masterUser.username,
        email: masterUser.email,
        role: masterUser.role || 'tenant',
        tenant_code: masterUser.tenant_code || '',
        campus_name: masterUser.campus_name || '',
      },
    });

    const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol || '';
    const isHttps = proto.includes('https') || (process.env.BETTER_AUTH_URL?.startsWith('https://') ?? false);

    // Session-only cookie (cleared when browser closes) with strict security flags
    const cookieOpts = {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax' as const,
      path: '/',
    };

    response.cookies.set(SESSION_COOKIE_NAME, signedToken, cookieOpts);

    // Also set signed token in legacy cookies for backward compatibility, avoiding raw JSON
    for (const legacyName of LEGACY_COOKIE_NAMES) {
      response.cookies.set(legacyName, signedToken, cookieOpts);
    }

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
