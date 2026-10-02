import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { syncMasterUserToBetterAuth } from '@/lib/auth';
import { checkDualLoginRateLimit, resetLoginRateLimit } from '@/lib/rate-limit';
import {
  signSessionToken,
  SESSION_COOKIE_NAME,
  LEGACY_COOKIE_NAMES,
  SESSION_MAX_ABSOLUTE_MS,
  SESSION_MAX_IDLE_MS,
} from '@/lib/session';
import { createServerSession } from '@/lib/session-store';

function isOriginAllowed(req: NextRequest): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    const referer = req.headers.get('referer');
    if (!referer) return true; // Direct non-browser calls
    try {
      return checkOriginMatch(new URL(referer).origin, req);
    } catch {
      return false;
    }
  }
  return checkOriginMatch(origin, req);
}

function checkOriginMatch(origin: string, req: NextRequest): boolean {
  const host = req.headers.get('host') || req.headers.get('x-forwarded-host');
  if (host && (origin === `http://${host}` || origin === `https://${host}`)) {
    return true;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  if (appUrl) {
    try {
      if (new URL(appUrl).origin === origin) return true;
    } catch {}
  }
  const trusted = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
  if (trusted) {
    const list = trusted.split(',').map((s) => s.trim());
    if (list.includes(origin)) return true;
  }
  if (process.env.NODE_ENV !== 'production') {
    if (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000') return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  try {
    // 0. CSRF / Origin Validation
    if (!isOriginAllowed(req)) {
      return NextResponse.json(
        { success: false, error: 'Akses ditolak: origin request tidak valid.' },
        { status: 403 }
      );
    }

    // 1. Safe JSON parsing (returns 400 on malformed payload)
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Format permintaan tidak valid.' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Bad request payload.' },
        { status: 400 }
      );
    }

    const rawUsername = body.username ?? body.email;
    const rawPassword = body.password;

    // 2. Strict Input Type Validation & Length Caps (Defends against CPU DoS on Argon2)
    if (typeof rawUsername !== 'string' || typeof rawPassword !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Username dan Password wajib diisi dengan format teks.' },
        { status: 400 }
      );
    }

    const usernameInput = rawUsername.trim();
    // Do NOT trim password: preserve exact characters as typed by the user
    const passwordInput = rawPassword;

    if (!usernameInput || !passwordInput) {
      return NextResponse.json(
        { success: false, error: 'Username dan Password wajib diisi.' },
        { status: 400 }
      );
    }

    if (usernameInput.length > 128 || passwordInput.length > 256) {
      return NextResponse.json(
        { success: false, error: 'Panjang karakter melebihi batas aman.' },
        { status: 400 }
      );
    }

    // 3. Client IP Resolution: Trust X-Real-IP set by Nginx reverse proxy
    const clientIp = req.headers.get('x-real-ip') || '127.0.0.1';

    // 4. Dual-Bucket Rate Limiting (IP bucket: 30 / 15m, User bucket: 10 / 15m)
    const rateCheck = await checkDualLoginRateLimit(clientIp, usernameInput, {
      ipLimit: 30,
      userLimit: 10,
      windowSeconds: 15 * 60,
    });

    if (!rateCheck.allowed) {
      const waitSeconds = Math.max(1, rateCheck.retryAfterSeconds);
      const res = NextResponse.json(
        {
          success: false,
          error: `Terlalu banyak percobaan login yang gagal. Silakan coba kembali dalam ${Math.ceil(waitSeconds / 60)} menit.`,
        },
        { status: 429 }
      );
      res.headers.set('Retry-After', String(waitSeconds));
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res;
    }

    // 5. Verify credentials against master database (Argon2id / bcrypt) with constant-time dummy mitigation
    const syncRes = await syncMasterUserToBetterAuth(usernameInput, passwordInput);
    if (!syncRes.success || !syncRes.user) {
      // Uniform generic 401 error message (prevents username enumeration oracle)
      const res = NextResponse.json(
        { success: false, error: 'Username atau password tidak valid.' },
        { status: 401 }
      );
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res;
    }

    // Reset user rate limit on successful verification
    await resetLoginRateLimit(clientIp, usernameInput);

    const masterUser = syncRes.user;
    const role = (masterUser.role || '').toLowerCase();
    const dbName = masterUser.database_name || '';

    // Enforce Tenant-Only Dashboard Access with identical uniform 401
    if (role === 'admin' || role === 'superadmin' || !dbName || dbName === '-') {
      return NextResponse.json(
        { success: false, error: 'Username atau password tidak valid.' },
        { status: 401 }
      );
    }

    const now = Date.now();
    const sessionId = crypto.randomUUID();
    const expiresAt = now + SESSION_MAX_ABSOLUTE_MS; // 12-hour absolute lifetime ceiling

    // 6. Create authoritative server-side session in Redis (15-min idle TTL, 12-hr absolute ceiling)
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
      Math.floor(SESSION_MAX_IDLE_MS / 1000)
    );

    // 7. Issue cryptographically signed session token (HMAC-SHA256)
    const signedToken = await signSessionToken({
      sessionId,
      userId: masterUser.id,
      username: masterUser.username,
      role: masterUser.role || 'tenant',
      issuedAt: now,
      lastActive: now,
      expiresAt: expiresAt,
    });

    // 8. Return sanitized user presentation DTO (ASOC-F3: NO database_name or redis_prefix)
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

    // 9. Hardened Cookie Configuration: Deterministic Secure flag in production
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOpts = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
    };

    response.cookies.set(SESSION_COOKIE_NAME, signedToken, cookieOpts);

    // Clean up all legacy cookies explicitly so old unencrypted tokens don't linger
    for (const legacyName of LEGACY_COOKIE_NAMES) {
      response.cookies.set(legacyName, '', { path: '/', maxAge: 0 });
    }

    // 10. Security response headers
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    response.headers.set('Pragma', 'no-cache');

    return response;
  } catch (err: any) {
    console.error('[Auth Login] Unexpected error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Terjadi kesalahan sistem saat memproses login.',
      },
      { status: 500 }
    );
  }
}
