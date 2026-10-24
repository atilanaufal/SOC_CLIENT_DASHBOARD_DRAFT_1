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

function parseBase64NoPadding(b64: string): Buffer {
  const padLen = (4 - (b64.length % 4)) % 4;
  return Buffer.from(b64 + '='.repeat(padLen), 'base64');
}

export async function verifyArgon2(password: string, hashStr: string): Promise<boolean> {
  if (!hashStr || !hashStr.startsWith('$argon2')) return false;

  // 1. Primary: Fast WebAssembly verification via hash-wasm (~100-500ms, non-blocking)
  try {
    const { argon2Verify } = await import('hash-wasm');
    return await argon2Verify({ password, hash: hashStr });
  } catch {
    // Fall through to noble-hashes fallback if WASM is unavailable
  }

  // 2. Fallback: Pure JS verification via @noble/hashes
  try {
    const { argon2id, argon2d, argon2i } = await import('@noble/hashes/argon2.js');
    const parts = hashStr.split('$');
    const type = parts[1];
    let version = 0x13;
    let paramsIndex = 2;
    if (parts[2]?.startsWith('v=')) {
      version = parseInt(parts[2].replace('v=', ''), 10);
      paramsIndex = 3;
    }
    const rawParams = (parts[paramsIndex] || '').split(',');
    const saltB64 = parts[paramsIndex + 1];
    const hashB64 = parts[paramsIndex + 2];
    if (!saltB64 || !hashB64) return false;

    const params: Record<string, number> = {};
    for (const p of rawParams) {
      const [k, v] = p.split('=');
      if (k && v) params[k] = parseInt(v, 10);
    }

    const salt = parseBase64NoPadding(saltB64);
    const expectedHash = parseBase64NoPadding(hashB64);

    const hasher = type === 'argon2d' ? argon2d : (type === 'argon2i' ? argon2i : argon2id);
    const derived = hasher(password, salt, {
      t: params.t || 3,
      m: params.m || 65536,
      p: params.p || 4,
      dkLen: expectedHash.length,
      version: version,
    });

    return Buffer.from(derived).equals(expectedHash);
  } catch (err) {
    console.error('Argon2 verification error:', err);
    return false;
  }
}


export function getOrCreateMysqlPool(): mysql.Pool {
  if (activePool) return activePool;

  const primaryHost = getMysqlHost();
  activeHost = primaryHost;
  activePool = mysql.createPool({
    host: primaryHost,
    port: MYSQL_PORT,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 5000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });

  return activePool;
}

export async function getMysqlConnection(): Promise<mysql.PoolConnection> {
  const pool = getOrCreateMysqlPool();

  try {
    return await pool.getConnection();
  } catch (primaryErr: any) {
    const fallbackHost = getMysqlFallbackHost();
    if (fallbackHost && fallbackHost !== activeHost) {
      try {
        if (activePool) {
          try { await activePool.end(); } catch {}
          activePool = null;
        }
        activeHost = fallbackHost;
        activePool = mysql.createPool({
          host: fallbackHost,
          port: MYSQL_PORT,
          user: MYSQL_USER,
          password: MYSQL_PASSWORD,
          database: MYSQL_DATABASE,
          waitForConnections: true,
          connectionLimit: 10,
          connectTimeout: 5000,
          enableKeepAlive: true,
          keepAliveInitialDelay: 10000,
        });
        return await activePool.getConnection();
      } catch (fallbackErr: any) {
        throw new Error(`MySQL connection failed to primary (${activeHost}) and fallback (${fallbackHost}): ${primaryErr.message}`);
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

interface CachedUserSchema {
  usernameCol: string;
  passwordCol: string;
  hasRole: boolean;
  hasEmail: boolean;
  expiresAt: number;
}

let cachedUserSchema: CachedUserSchema | null = null;

async function getUserSchema(conn: mysql.PoolConnection): Promise<CachedUserSchema> {
  const now = Date.now();
  if (cachedUserSchema && cachedUserSchema.expiresAt > now) {
    return cachedUserSchema;
  }
  try {
    const [cols]: any = await conn.query('DESCRIBE users');
    const colSet = new Set((cols || []).map((c: any) => c.Field.toLowerCase()));
    cachedUserSchema = {
      usernameCol: colSet.has('username') ? 'u.username' : 'u.name',
      passwordCol: colSet.has('password_hash') ? 'u.password_hash' : 'u.password',
      hasRole: colSet.has('role'),
      hasEmail: colSet.has('email'),
      expiresAt: now + 5 * 60 * 1000, // cache schema 5 minutes
    };
    return cachedUserSchema;
  } catch {
    return {
      usernameCol: 'u.name',
      passwordCol: 'u.password',
      hasRole: true,
      hasEmail: false,
      expiresAt: now + 30 * 1000,
    };
  }
}

export async function verifyUserCredentials(
  usernameOrEmailInput: string,
  passwordInput: string
): Promise<{ success: boolean; user?: UserRecord; error?: string }> {
  let conn: mysql.PoolConnection | null = null;
  try {
    conn = await getMysqlConnection();

    // 1. Efficient Schema Lookup (cached in-memory)
    const { usernameCol, passwordCol, hasRole, hasEmail } = await getUserSchema(conn);
    const selectEmail = hasEmail ? 'u.email' : 'NULL AS email';

    // 2. Optimized WHERE clause leveraging direct B-Tree index (idx_username / idx_name)
    const isEmailInput = hasEmail && usernameOrEmailInput.includes('@');
    const whereClause = isEmailInput
      ? 'WHERE u.email = ?'
      : (hasEmail ? `WHERE ${usernameCol} = ? OR u.email = ?` : `WHERE ${usernameCol} = ?`);
    const queryParams = isEmailInput
      ? [usernameOrEmailInput]
      : (hasEmail ? [usernameOrEmailInput, usernameOrEmailInput] : [usernameOrEmailInput]);

    const [rows]: any = await conn.execute(
      `SELECT 
        u.id, 
        u.tenant_id, 
        ${usernameCol} AS username, 
        ${passwordCol} AS password_hash, 
        ${selectEmail}${hasRole ? ', u.role' : ''},
        t.tenant_code, 
        t.campus_name, 
        t.database_name, 
        t.redis_prefix
       FROM users u
       LEFT JOIN tenants t ON u.tenant_id = t.id
       ${whereClause}
       LIMIT 1`,
      queryParams
    );

    // OWASP-balanced Argon2id dummy hash (m=19456, t=2, p=1) for constant-time mitigation
    const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$MTIzNDU2Nzg5MDEyMzQ1Ng$u+dT7EAHHTrTvvvwajvChP2Q1UsFbD/ikafuaSfWH9Q';

    if (!Array.isArray(rows) || rows.length === 0) {
      // Execute dummy verification to prevent username enumeration timing attack
      await verifyArgon2(passwordInput, DUMMY_HASH);
      return { success: false, error: 'Invalid username or password.' };
    }

    const user = rows[0];
    const roleLower = String(user.role || '').trim().toLowerCase();
    const dbName = String(user.database_name || '').trim();

    // Block admin/superadmin accounts from tenant portal with generic 401 (prevents admin password verification via tenant portal)
    if (roleLower === 'admin' || roleLower === 'superadmin' || !dbName || dbName === '-') {
      await verifyArgon2(passwordInput, DUMMY_HASH);
      return { success: false, error: 'Invalid username or password.' };
    }

    const storedHash = user.password_hash || '';

    let isMatch = false;

    // 1. Argon2 verification ($argon2id, $argon2i, $argon2d)
    if (storedHash.startsWith('$argon2')) {
      isMatch = await verifyArgon2(passwordInput, storedHash);
    }

    // 2. Bcrypt verification ($2a$, $2b$, $2y$)
    if (!isMatch && (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$'))) {
      try {
        isMatch = await bcrypt.compare(passwordInput, storedHash);
      } catch {
        isMatch = false;
      }
    }

    // 3. Cryptographic hash fallbacks (Salted SHA-256 / SHA-512)
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
      return {
        success: true,
        user: {
          id: user.id,
          tenant_id: user.tenant_id,
          username: user.username,
          email: user.email,
          role: user.role || 'tenant',
          tenant_code: user.tenant_code || '',
          campus_name: user.campus_name || '',
          database_name: user.database_name || '',
          redis_prefix: user.redis_prefix || user.database_name || '',
        },
      };
    } else {
      return { success: false, error: 'Invalid username or password.' };
    }
  } catch (err: any) {
    console.error('MySQL Database Connection Error:', err.message);
    const sanitizedMessage = process.env.NODE_ENV === 'production'
      ? 'Failed to connect to authentication database service. Please contact administrator.'
      : `Failed to connect to MySQL Database (${activeHost}:${MYSQL_PORT}): ${err.message}`;

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

// In-memory cache for authoritative user-tenant resolution (TTL: 60 seconds)
const tenantResolutionCache = new Map<string, { data: any; expiresAt: number }>();

/**
 * Resolves authoritative tenant binding directly from master MySQL database.
 * Strictly verifies user existence, tenant assignment, and database routing.
 * Rejects admin/superadmin accounts from client dashboard.
 */
export async function getAuthoritativeTenantByUserId(userId: number | string): Promise<any | null> {
  if (!userId) return null;

  const cacheKey = String(userId);
  const now = Date.now();
  const cached = tenantResolutionCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  let conn: mysql.PoolConnection | null = null;
  try {
    conn = await getMysqlConnection();

    const [cols]: any = await conn.query('DESCRIBE users');
    const colSet = new Set((cols || []).map((c: any) => c.Field.toLowerCase()));

    const usernameCol = colSet.has('username') ? 'u.username' : 'u.name';
    const hasRole = colSet.has('role');
    const hasEmail = colSet.has('email');
    const selectEmail = hasEmail ? 'u.email' : 'NULL AS email';

    const [rows]: any = await conn.execute(
      `SELECT 
        u.id, 
        u.tenant_id, 
        ${usernameCol} AS username, 
        ${selectEmail}${hasRole ? ', u.role' : ''},
        t.tenant_code, 
        t.campus_name, 
        t.database_name, 
        t.redis_prefix
       FROM users u
       INNER JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const role = (row.role || 'tenant').toLowerCase();
    const databaseName = (row.database_name || '').trim();

    // Deny admin or non-tenant accounts from accessing tenant dashboard
    if (role === 'admin' || role === 'superadmin' || !databaseName || databaseName === '-') {
      return null;
    }

    const tenantContext = {
      userId: row.id,
      username: row.username,
      email: row.email || null,
      tenantId: Number(row.tenant_id) || 0,
      tenantCode: row.tenant_code || '',
      campusName: row.campus_name || '',
      databaseName: databaseName,
      redisPrefix: row.redis_prefix || databaseName,
      role: row.role || 'tenant',
    };

    tenantResolutionCache.set(cacheKey, {
      data: tenantContext,
      expiresAt: now + 60 * 1000, // 60 seconds TTL
    });

    return tenantContext;
  } catch (err: any) {
    console.error(`[MySQL] Error resolving tenant for userId ${userId}:`, err.message);
    return null;
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch {}
    }
  }
}

export async function hashPasswordArgon2id(password: string): Promise<string> {
  const { argon2id } = await import('hash-wasm');
  const salt = crypto.randomBytes(16);
  return await argon2id({
    password,
    salt,
    parallelism: 4,
    iterations: 3,
    memorySize: 65536,
    hashLength: 32,
    outputType: 'encoded',
  });
}

export async function updateUserPassword(
  userId: number | string,
  newPasswordPlain: string
): Promise<{ success: boolean; error?: string }> {
  let conn: mysql.PoolConnection | null = null;
  try {
    const passwordHash = await hashPasswordArgon2id(newPasswordPlain);
    conn = await getMysqlConnection();
    const [result]: any = await conn.execute(
      'UPDATE users SET password = ? WHERE id = ?',
      [passwordHash, userId]
    );
    if (!result || result.affectedRows === 0) {
      return { success: false, error: 'User tidak ditemukan.' };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error updating user password in MySQL:', err);
    return { success: false, error: err.message || 'Gagal mengubah password di basis data.' };
  } finally {
    if (conn) {
      try {
        conn.release();
      } catch {}
    }
  }
}
