import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import mysql from 'mysql2/promise';

import { verifyUserCredentials } from './mysql';

function getMysqlHost(): string {
  return process.env.MYSQL_HOST || '127.0.0.1';

}

const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'auth_user';

const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'auth_db';

// Ensure secret is securely provided
const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('CRITICAL: BETTER_AUTH_SECRET environment variable is missing.'); })()
    : 'dev_default_secret_please_set_in_production_32_chars_long');


// Create resilient connection pool for Better Auth
export const authDbPool = mysql.createPool({
  host: getMysqlHost(),
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,

  connectTimeout: 3000,

});

export const auth = betterAuth({
  database: authDbPool,

  secret: BETTER_AUTH_SECRET,

  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  trustedOrigins: async (request) => {
    const origins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ];
    if (process.env.BETTER_AUTH_TRUSTED_ORIGINS) {
      origins.push(...process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map((s) => s.trim()));
    }
    if (request) {
      const origin = request.headers.get('origin');
      if (origin) origins.push(origin);
      const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
      if (host) {
        origins.push(`http://${host}`);
        origins.push(`https://${host}`);
      }
    }
    return Array.from(new Set(origins.filter(Boolean)));
  },
  advanced: {
    useSecureCookies: process.env.BETTER_AUTH_URL?.startsWith('https://') ?? false,
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        input: true,
      },
      tenantId: {
        type: 'number',
        required: false,
        input: true,
      },
      tenantCode: {
        type: 'string',
        required: false,
        input: true,
      },
      campusName: {
        type: 'string',
        required: false,
        input: true,
      },
      databaseName: {
        type: 'string',
        required: false,
        input: true,
      },
      redisPrefix: {
        type: 'string',
        required: false,
        input: true,
      },
    },
  },
  plugins: [
    username(),
  ],
});

/**
 * Ensures a user from the master MySQL `users` & `tenants` table
 * is synchronized with Better Auth `user` and `account` tables.
 */
export async function syncMasterUserToBetterAuth(
  usernameOrEmail: string,
  plainPassword: string
): Promise<{ success: boolean; error?: string; user?: any }> {
  try {

    // 1. Verify against master users/tenants table with bcrypt/salted hash

    const check = await verifyUserCredentials(usernameOrEmail, plainPassword);
    if (!check.success || !check.user) {
      return { success: false, error: check.error || 'Autentikasi gagal.' };
    }

    const masterUser = check.user;
    const userEmail = masterUser.email || `${masterUser.username}@asoc.internal`;

    const tenantCode = masterUser.tenant_code || '';
    const campusName = masterUser.campus_name || '';
    const databaseName = masterUser.database_name || '';
    const redisPrefix = masterUser.redis_prefix || databaseName;


    // 2. Check if user already exists in Better Auth `user` table
    const [existingRows]: any = await authDbPool.query(
      'SELECT id, email, username FROM user WHERE username = ? OR email = ? LIMIT 1',
      [masterUser.username, userEmail]
    );

    if (existingRows && existingRows.length > 0) {
      const baUser = existingRows[0];

      // Update tenant metadata dynamically from MySQL master

      await authDbPool.query(
        `UPDATE user SET 
          role = ?, 
          tenantId = ?, 
          tenantCode = ?, 
          campusName = ?, 
          databaseName = ?, 
          redisPrefix = ?
         WHERE id = ?`,
        [

          masterUser.role || 'tenant',
          masterUser.tenant_id || 0,
          tenantCode,
          campusName,
          databaseName,
          redisPrefix,

          baUser.id,
        ]
      );
      return { success: true, user: masterUser };
    }

    // 3. User does not exist in Better Auth table yet -> Register into Better Auth
    try {
      await auth.api.signUpEmail({
        body: {
          email: userEmail,
          password: plainPassword,

          name: campusName || masterUser.username,
          username: masterUser.username,
          role: masterUser.role || 'tenant',
          tenantId: masterUser.tenant_id || 0,
          tenantCode: tenantCode,
          campusName: campusName,
          databaseName: databaseName,
          redisPrefix: redisPrefix,

        } as any,
      });
    } catch (signupErr: any) {
      console.warn('Better Auth auto-signup notice:', signupErr.message);
    }

    return { success: true, user: masterUser };
  } catch (err: any) {
    console.error('Error in syncMasterUserToBetterAuth:', err);

    return {
      success: false,
      error: process.env.NODE_ENV === 'production'
        ? 'Gagal memproses sinkronisasi akun pengguna.'
        : `Database sync error: ${err.message}`,
    };

  }
}
