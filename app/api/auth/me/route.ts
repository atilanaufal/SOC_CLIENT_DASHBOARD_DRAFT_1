import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {

    // Check session securely via Better Auth API

    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (session && session.user) {
      const u = session.user as any;

      const databaseName = u.databaseName || u.database_name || '';
      const redisPrefix = u.redisPrefix || u.redis_prefix || databaseName;


      return NextResponse.json({
        success: true,
        authenticated: true,
        user: {
          id: u.id,

          tenant_id: u.tenantId || u.tenant_id || 0,
          username: u.username || u.name || '',
          email: u.email || null,
          role: u.role || 'tenant',
          tenant_code: u.tenantCode || u.tenant_code || '',
          campus_name: u.campusName || u.campus_name || '',
          database_name: databaseName,
          redis_prefix: redisPrefix,
        },
      });
    }

    // Fallback to auth_session cookie
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
