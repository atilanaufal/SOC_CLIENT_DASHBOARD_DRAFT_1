import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    // 1. Check session via Better Auth API
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (session && session.user) {
      const u = session.user as any;
      return NextResponse.json({
        success: true,
        authenticated: true,
        user: {
          id: u.id,
          tenant_id: u.tenantId || 1,
          username: u.username || u.name,
          email: u.email,
          role: u.role || 'tenant',
          tenant_code: u.tenantCode || 'UI',
          campus_name: u.campusName || 'Universitas Indonesia',
          database_name: u.databaseName || 'universitas_indonesia',
          redis_prefix: u.redisPrefix || 'universitas_indonesia',
        },
      });
    }

    // 2. Fallback to auth_session cookie
    const sessionCookie = req.cookies.get('auth_session')?.value;
    if (sessionCookie) {
      const user = JSON.parse(sessionCookie);
      return NextResponse.json({
        success: true,
        authenticated: true,
        user,
      });
    }

    return NextResponse.json(
      { success: false, authenticated: false, message: 'Tidak ada sesi terautentikasi' },
      { status: 401 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, authenticated: false, message: `Sesi tidak valid: ${err.message}` },
      { status: 401 }
    );
  }
}
