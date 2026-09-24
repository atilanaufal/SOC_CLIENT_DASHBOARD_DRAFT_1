import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {

    // Check session via asoc_client_session or auth_session cookie
    const sessionCookie =
      req.cookies.get('asoc_client_session')?.value ||
      req.cookies.get('auth_session')?.value;

    if (sessionCookie) {
      try {
        const user = JSON.parse(decodeURIComponent(sessionCookie));
        const role = (user.role || '').toLowerCase();
        const dbName = user.database_name || user.databaseName || '';

        // BLOKIR JIKA INI BUKAN AKUN TENANT (e.g. akun "ASOC Central Management" dari Admin Panel)
        if (role === 'admin' || role === 'superadmin' || !dbName || dbName === '-') {
          const res = NextResponse.json(
            { success: false, authenticated: false, message: 'Bukan akun tenant yang valid.' },
            { status: 401 }
          );
          res.cookies.set('asoc_client_session', '', { path: '/', maxAge: 0 });
          res.cookies.set('auth_session', '', { path: '/', maxAge: 0 });
          return res;
        }

        const lastActive = Number(user.last_active);
        if (lastActive && Date.now() - lastActive > 15 * 60 * 1000) {
          const res = NextResponse.json(
            { success: false, authenticated: false, message: 'Sesi telah berakhir karena tidak ada aktivitas selama 15 menit.' },
            { status: 401 }
          );
          res.cookies.set('asoc_client_session', '', { path: '/', maxAge: 0 });
          res.cookies.set('auth_session', '', { path: '/', maxAge: 0 });
          return res;
        }

        user.last_active = Date.now();
        const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol || '';
        const isHttps = proto.includes('https') || (process.env.BETTER_AUTH_URL?.startsWith('https://') ?? false);

        const response = NextResponse.json({
          success: true,
          authenticated: true,
          user: {
            id: user.id,
            tenant_id: user.tenant_id || user.tenantId || 0,
            username: user.username || user.name || '',
            email: user.email || null,
            role: user.role || 'tenant',
            tenant_code: user.tenant_code || user.tenantCode || '',
            campus_name: user.campus_name || user.campusName || '',
            database_name: user.database_name || user.databaseName || '',
            redis_prefix: user.redis_prefix || user.redisPrefix || user.database_name || '',
          },
        });

        // Rolling session: perpanjang cookie 15 menit jika aktif
        const cookieOpts = {
          httpOnly: true,
          secure: isHttps,
          sameSite: 'lax' as const,
          path: '/',
          maxAge: 15 * 60, // 15 menit
        };
        response.cookies.set('asoc_client_session', JSON.stringify(user), cookieOpts);
        response.cookies.set('auth_session', JSON.stringify(user), cookieOpts);

        return response;
      } catch {}
    }

    return NextResponse.json(
      { success: false, authenticated: false, message: 'Tidak ada sesi terautentikasi.' },
      { status: 401 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        message: process.env.NODE_ENV === 'production'
          ? 'Sesi tidak valid.'
          : `Sesi tidak valid: ${err.message}`,
      },
      { status: 401 }
    );


  }
}
