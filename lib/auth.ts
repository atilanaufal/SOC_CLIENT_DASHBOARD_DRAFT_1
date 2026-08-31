import { betterAuth } from 'better-auth';
import { username } from 'better-auth/plugins';
import mysql from 'mysql2/promise';
<<<<<<< Updated upstream
import { verifyUserCredentials, getMysqlConnection } from './mysql';

function getMysqlHost() {
  return process.env.MYSQL_HOST || '192.168.1.20';
}

function getMysqlFallbackHost() {
  return process.env.MYSQL_FALLBACK_HOST || '10.21.126.82';
=======
import { verifyUserCredentials } from './mysql';

function getMysqlHost(): string {
  return process.env.MYSQL_HOST || '127.0.0.1';
>>>>>>> Stashed changes
}

const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'auth_user';
<<<<<<< Updated upstream
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'admin12345';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'auth_db';

=======
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'auth_db';

// Ensure secret is securely provided
const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => { throw new Error('CRITICAL: BETTER_AUTH_SECRET environment variable is missing.'); })()
    : 'dev_default_secret_please_set_in_production_32_chars_long');

>>>>>>> Stashed changes
// Create resilient connection pool for Better Auth
export const authDbPool = mysql.createPool({
  host: getMysqlHost(),
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
<<<<<<< Updated upstream
  connectTimeout: 2000,
=======
  connectTimeout: 3000,
>>>>>>> Stashed changes
});

export const auth = betterAuth({
  database: authDbPool,
<<<<<<< Updated upstream
  secret: process.env.BETTER_AUTH_SECRET || 'a8f9c42b10d7e6f3a1b5c9d2e4f7a8b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
=======
  secret: BETTER_AUTH_SECRET,
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
        defaultValue: 'tenant',
=======
>>>>>>> Stashed changes
        input: true,
      },
      tenantId: {
        type: 'number',
        required: false,
<<<<<<< Updated upstream
        defaultValue: 1,
=======
>>>>>>> Stashed changes
        input: true,
      },
      tenantCode: {
        type: 'string',
        required: false,
<<<<<<< Updated upstream
        defaultValue: 'UI',
=======
>>>>>>> Stashed changes
        input: true,
      },
      campusName: {
        type: 'string',
        required: false,
<<<<<<< Updated upstream
        defaultValue: 'Universitas Indonesia',
=======
>>>>>>> Stashed changes
        input: true,
      },
      databaseName: {
        type: 'string',
        required: false,
<<<<<<< Updated upstream
        defaultValue: 'universitas_indonesia',
=======
>>>>>>> Stashed changes
        input: true,
      },
      redisPrefix: {
        type: 'string',
        required: false,
<<<<<<< Updated upstream
        defaultValue: 'universitas_indonesia',
=======
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
    // 1. Verify against master users/tenants table
=======
    // 1. Verify against master users/tenants table with bcrypt/salted hash
>>>>>>> Stashed changes
    const check = await verifyUserCredentials(usernameOrEmail, plainPassword);
    if (!check.success || !check.user) {
      return { success: false, error: check.error || 'Autentikasi gagal.' };
    }

    const masterUser = check.user;
    const userEmail = masterUser.email || `${masterUser.username}@asoc.internal`;
<<<<<<< Updated upstream
=======
    const tenantCode = masterUser.tenant_code || '';
    const campusName = masterUser.campus_name || '';
    const databaseName = masterUser.database_name || '';
    const redisPrefix = masterUser.redis_prefix || databaseName;
>>>>>>> Stashed changes

    // 2. Check if user already exists in Better Auth `user` table
    const [existingRows]: any = await authDbPool.query(
      'SELECT id, email, username FROM user WHERE username = ? OR email = ? LIMIT 1',
      [masterUser.username, userEmail]
    );

    if (existingRows && existingRows.length > 0) {
      const baUser = existingRows[0];
<<<<<<< Updated upstream
      // Update tenant metadata if needed
=======
      // Update tenant metadata dynamically from MySQL master
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
          masterUser.role,
          masterUser.tenant_id,
          masterUser.tenant_code || 'UI',
          masterUser.campus_name || 'Universitas Indonesia',
          masterUser.database_name || 'universitas_indonesia',
          masterUser.redis_prefix || 'universitas_indonesia',
=======
          masterUser.role || 'tenant',
          masterUser.tenant_id || 0,
          tenantCode,
          campusName,
          databaseName,
          redisPrefix,
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
          name: masterUser.campus_name || masterUser.username,
          username: masterUser.username,
          role: masterUser.role,
          tenantId: masterUser.tenant_id,
          tenantCode: masterUser.tenant_code || 'UI',
          campusName: masterUser.campus_name || 'Universitas Indonesia',
          databaseName: masterUser.database_name || 'universitas_indonesia',
          redisPrefix: masterUser.redis_prefix || 'universitas_indonesia',
=======
          name: campusName || masterUser.username,
          username: masterUser.username,
          role: masterUser.role || 'tenant',
          tenantId: masterUser.tenant_id || 0,
          tenantCode: tenantCode,
          campusName: campusName,
          databaseName: databaseName,
          redisPrefix: redisPrefix,
>>>>>>> Stashed changes
        } as any,
      });
    } catch (signupErr: any) {
      console.warn('Better Auth auto-signup notice:', signupErr.message);
    }

    return { success: true, user: masterUser };
  } catch (err: any) {
    console.error('Error in syncMasterUserToBetterAuth:', err);
<<<<<<< Updated upstream
    return { success: false, error: err.message };
=======
    return {
      success: false,
      error: process.env.NODE_ENV === 'production'
        ? 'Gagal memproses sinkronisasi akun pengguna.'
        : `Database sync error: ${err.message}`,
    };
>>>>>>> Stashed changes
  }
}
