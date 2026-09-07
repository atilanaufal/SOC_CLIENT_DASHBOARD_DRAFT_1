import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {

    // Check session via auth_session cookie
    const sessionCookie = req.cookies.get('auth_session')?.value;
    if (sessionCookie) {
      try {
        const user = JSON.parse(decodeURIComponent(sessionCookie));
        return NextResponse.json({
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
