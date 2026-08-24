import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import mysql from 'mysql2/promise';
import { verifyUserCredentials, getMysqlConnection } from './mysql';

function getMysqlHost() {
  return process.env.MYSQL_HOST || '192.168.1.20';
}

function getMysqlFallbackHost() {
  return process.env.MYSQL_FALLBACK_HOST || '10.21.126.82';
}

const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'auth_user';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'admin12345';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'auth_db';

// Create resilient connection pool for Better Auth
export const authDbPool = mysql.createPool({
  host: getMysqlHost(),
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 2000,
});

export const auth = betterAuth({
  database: authDbPool,
  secret: process.env.BETTER_AUTH_SECRET || 'a8f9c42b10d7e6f3a1b5c9d2e4f7a8b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'tenant',
        input: true,
      },
      tenantId: {
        type: 'number',
        required: false,
        defaultValue: 1,
        input: true,
      },
      tenantCode: {
        type: 'string',
        required: false,
        defaultValue: 'UI',
        input: true,
      },
      campusName: {
        type: 'string',
        required: false,
        defaultValue: 'Universitas Indonesia',
        input: true,
      },
      databaseName: {
        type: 'string',
        required: false,
        defaultValue: 'universitas_indonesia',
        input: true,
      },
      redisPrefix: {
        type: 'string',
        required: false,
        defaultValue: 'universitas_indonesia',
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
    // 1. Verify against master users/tenants table
    const check = await verifyUserCredentials(usernameOrEmail, plainPassword);
    if (!check.success || !check.user) {
      return { success: false, error: check.error || 'Autentikasi gagal.' };
    }

    const masterUser = check.user;
    const userEmail = masterUser.email || `${masterUser.username}@asoc.internal`;

    // 2. Check if user already exists in Better Auth `user` table
    const [existingRows]: any = await authDbPool.query(
      'SELECT id, email, username FROM user WHERE username = ? OR email = ? LIMIT 1',
      [masterUser.username, userEmail]
    );

    if (existingRows && existingRows.length > 0) {
      const baUser = existingRows[0];
      // Update tenant metadata if needed
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
          masterUser.role,
          masterUser.tenant_id,
          masterUser.tenant_code || 'UI',
          masterUser.campus_name || 'Universitas Indonesia',
          masterUser.database_name || 'universitas_indonesia',
          masterUser.redis_prefix || 'universitas_indonesia',
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
          name: masterUser.campus_name || masterUser.username,
          username: masterUser.username,
          role: masterUser.role,
          tenantId: masterUser.tenant_id,
          tenantCode: masterUser.tenant_code || 'UI',
          campusName: masterUser.campus_name || 'Universitas Indonesia',
          databaseName: masterUser.database_name || 'universitas_indonesia',
          redisPrefix: masterUser.redis_prefix || 'universitas_indonesia',
        } as any,
      });
    } catch (signupErr: any) {
      console.warn('Better Auth auto-signup notice:', signupErr.message);
    }

    return { success: true, user: masterUser };
  } catch (err: any) {
    console.error('Error in syncMasterUserToBetterAuth:', err);
    return { success: false, error: err.message };
  }
}
