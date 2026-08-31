import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
<<<<<<< Updated upstream
    // 1. Check session via Better Auth API
=======
    // Check session securely via Better Auth API
>>>>>>> Stashed changes
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (session && session.user) {
      const u = session.user as any;
<<<<<<< Updated upstream
=======
      const databaseName = u.databaseName || u.database_name || '';
      const redisPrefix = u.redisPrefix || u.redis_prefix || databaseName;

>>>>>>> Stashed changes
      return NextResponse.json({
        success: true,
        authenticated: true,
        user: {
          id: u.id,
<<<<<<< Updated upstream
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
=======
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
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
  } catch (err: any) {
    return NextResponse.json(
      { success: false, authenticated: false, message: `Sesi tidak valid: ${err.message}` },
      { status: 401 }
    );
=======
>>>>>>> Stashed changes
  }
}
