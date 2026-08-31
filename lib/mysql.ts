import mysql from 'mysql2/promise';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';


function getMysqlHost(): string {
  return process.env.MYSQL_HOST || '127.0.0.1';
}

function getMysqlFallbackHost(): string {
  return process.env.MYSQL_FALLBACK_HOST || '';

}

const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'auth_user';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'auth_db';
const MYSQL_SALT = process.env.MYSQL_SALT || 'sec_auth_salt_2026';

let activePool: mysql.Pool | null = null;
let activeHost: string = getMysqlHost();

export function hashPasswordSHA256(password: string): string {
  return crypto.createHash('sha256').update(password, 'utf-8').digest('hex');
}

export function hashPasswordSHA256Salted(password: string, salt: string = MYSQL_SALT): string {
  return crypto.createHash('sha256').update(password + salt, 'utf-8').digest('hex');
}

export function hashPasswordSHA512(password: string, salt: string = MYSQL_SALT): string {
  const salted = password + salt;
  return crypto.createHash('sha512').update(salted, 'utf-8').digest('hex');
}

export function hashPasswordSHA512Raw(password: string): string {
  return crypto.createHash('sha512').update(password, 'utf-8').digest('hex');
}


export async function hashPasswordBcrypt(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}


export async function getMysqlConnection(): Promise<mysql.PoolConnection> {
  const primaryHost = getMysqlHost();
  const fallbackHost = getMysqlFallbackHost();

  // Primary attempt
  try {
    const primaryPool = mysql.createPool({
      host: primaryHost,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 3000,
    });
    const conn = await primaryPool.getConnection();
    activePool = primaryPool;
    activeHost = primaryHost;
    return conn;
  } catch (primaryErr: any) {
    // Fallback attempt if configured
    if (fallbackHost && fallbackHost !== primaryHost) {
      try {
        const fallbackPool = mysql.createPool({
          host: fallbackHost,
          port: MYSQL_PORT,
          user: MYSQL_USER,
          password: MYSQL_PASSWORD,
          database: MYSQL_DATABASE,
          waitForConnections: true,
          connectionLimit: 10,
          connectTimeout: 3000,
        });
        const conn = await fallbackPool.getConnection();
        activePool = fallbackPool;
        activeHost = fallbackHost;
        return conn;
      } catch (fallbackErr: any) {
        throw new Error(`MySQL connection failed to primary and fallback hosts: ${primaryErr.message}`);
      }
    }
    throw primaryErr;
  }
}

export interface UserRecord {
  id: number;
  tenant_id: number;
  username: string;
  email: string | null;
  role: 'admin' | 'tenant' | string;
  tenant_code?: string;
  campus_name?: string;
  database_name?: string;
  redis_prefix?: string;
}

export async function verifyUserCredentials(
  usernameOrEmailInput: string,
  passwordInput: string
): Promise<{ success: boolean; user?: UserRecord; error?: string }> {
  let conn: mysql.PoolConnection | null = null;
  try {
    conn = await getMysqlConnection();
    const [rows]: any = await conn.execute(
      `SELECT 
        u.id, 
        u.tenant_id, 
        u.username, 
        u.password_hash, 
        u.email,
        t.tenant_code, 
        t.campus_name, 
        t.database_name, 
        t.redis_prefix
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE u.username = ? OR u.email = ?`,
      [usernameOrEmailInput, usernameOrEmailInput]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, error: 'Username atau email tidak terdaftar.' };
    }

    const user = rows[0];

    const storedHash = user.password_hash || '';

    let isMatch = false;

    // 1. Bcrypt verification ($2a$, $2b$, $2y$)
    if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
      try {
        isMatch = await bcrypt.compare(passwordInput, storedHash);
      } catch {
        isMatch = false;
      }
    }

    // 2. Cryptographic hash fallbacks (Salted SHA-256 / SHA-512)
    if (!isMatch) {
      const computedSha256SaltPrimary = hashPasswordSHA256Salted(passwordInput, MYSQL_SALT);
      const computedSha256SaltDoc = hashPasswordSHA256Salted(passwordInput, 'tguard_secure_salt_2026');
      const computedSha512Primary = hashPasswordSHA512(passwordInput, MYSQL_SALT);
      const computedSha512Doc = hashPasswordSHA512(passwordInput, 'tguard_secure_salt_2026');
      const computedSha256 = hashPasswordSHA256(passwordInput);
      const computedSha512Raw = hashPasswordSHA512Raw(passwordInput);

      isMatch = (
        storedHash === computedSha256 ||
        storedHash === computedSha256SaltPrimary ||
        storedHash === computedSha256SaltDoc ||
        storedHash === computedSha512Primary ||
        storedHash === computedSha512Doc ||
        storedHash === computedSha512Raw
      );
    }

    if (isMatch) {
      const usernameLower = (user.username || '').toLowerCase();
      const detectedRole = usernameLower.includes('admin') ? 'admin' : (user.role || 'tenant');


      return {
        success: true,
        user: {
          id: user.id,
          tenant_id: user.tenant_id,
          username: user.username,
          email: user.email,
          role: detectedRole,

          tenant_code: user.tenant_code || '',
          campus_name: user.campus_name || '',
          database_name: user.database_name || '',
          redis_prefix: user.redis_prefix || user.database_name || '',

        },
      };
    } else {
      return { success: false, error: 'Password yang Anda masukkan tidak sesuai.' };
    }
  } catch (err: any) {
    console.error('MySQL Database Connection Error:', err.message);
    const sanitizedMessage = process.env.NODE_ENV === 'production'
      ? 'Gagal terhubung ke layanan database autentikasi. Silakan hubungi administrator.'
      : `Gagal terhubung ke Database MySQL (${activeHost}:${MYSQL_PORT}): ${err.message}`;

    return {
      success: false,
      error: sanitizedMessage,
    };
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch {}
    }
  }
}
