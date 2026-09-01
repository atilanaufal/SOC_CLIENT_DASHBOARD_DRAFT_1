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
