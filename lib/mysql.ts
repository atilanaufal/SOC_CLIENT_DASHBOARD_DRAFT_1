import mysql from 'mysql2/promise';
import crypto from 'crypto';

function getMysqlHost() {
  return process.env.MYSQL_HOST || '192.168.1.20';
}

function getMysqlFallbackHost() {
  return process.env.MYSQL_FALLBACK_HOST || '127.0.0.1';
}

const MYSQL_PORT = Number(process.env.MYSQL_PORT) || 3306;
const MYSQL_USER = process.env.MYSQL_USER || 'auth_user';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'admin12345';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'auth_db';
const MYSQL_SALT = process.env.MYSQL_SALT || 'sec_auth_salt_2026';

let activePool: mysql.Pool | null = null;
let activeHost: string = getMysqlHost();

export function hashPasswordSHA512(password: string, salt: string = MYSQL_SALT): string {
  const salted = password + salt;
  return crypto.createHash('sha512').update(salted, 'utf-8').digest('hex');
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
      connectionLimit: 5,
      connectTimeout: 2000,
    });
    const conn = await primaryPool.getConnection();
    activePool = primaryPool;
    activeHost = primaryHost;
    return conn;
  } catch (primaryErr: any) {
    // Fallback attempt
    if (fallbackHost !== primaryHost) {
      try {
        const fallbackPool = mysql.createPool({
          host: fallbackHost,
          port: MYSQL_PORT,
          user: MYSQL_USER,
          password: MYSQL_PASSWORD,
          database: MYSQL_DATABASE,
          waitForConnections: true,
          connectionLimit: 5,
          connectTimeout: 2000,
        });
        const conn = await fallbackPool.getConnection();
        activePool = fallbackPool;
        activeHost = fallbackHost;
        return conn;
      } catch (fallbackErr: any) {
        throw new Error(`Koneksi MySQL gagal ke Host ${primaryHost}:${MYSQL_PORT} (${primaryErr.message})`);
      }
    }
    throw primaryErr;
  }
}

export interface UserRecord {
  id: number;
  username: string;
  role: 'admin' | 'tenant';
}

export async function verifyUserCredentials(
  usernameInput: string,
  passwordInput: string
): Promise<{ success: boolean; user?: UserRecord; error?: string }> {
  let conn: mysql.PoolConnection | null = null;
  try {
    // Strictly connect to MySQL database on target VM
    conn = await getMysqlConnection();
    const [rows]: any = await conn.execute(
      'SELECT id, username, password, role FROM users WHERE username = ?',
      [usernameInput]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return { success: false, error: 'Username atau email tidak ditemukan di database MySQL.' };
    }

    const user = rows[0];
    const storedHash = user.password;

    // Calculate SHA-512 hash using configured salt
    const computedHashPrimary = hashPasswordSHA512(passwordInput, MYSQL_SALT);
    const computedHashDocFallback = hashPasswordSHA512(passwordInput, 'tguard_secure_salt_2026');

    if (storedHash === computedHashPrimary || storedHash === computedHashDocFallback) {
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      };
    } else {
      return { success: false, error: 'Password yang Anda masukkan salah.' };
    }
  } catch (err: any) {
    // Strictly report real MySQL database connection errors (No mock/fallback accounts allowed)
    console.error('MySQL Database Connection Error:', err.message);
    return {
      success: false,
      error: `Gagal terhubung ke Database MySQL VM (${activeHost}:${MYSQL_PORT}). Pastikan server MySQL di VM berjalan dan dapat diakses. Detail: ${err.message}`,
    };
  } finally {
    if (conn) {
      try { conn.release(); } catch {}
    }
  }
}
