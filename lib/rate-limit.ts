import crypto from 'crypto';
import { getActiveRedisClient } from './redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTimeMs: number;
  retryAfterSeconds: number;
}

// In-memory fallback if Redis is unavailable
const memoryStore = new Map<string, { count: number; expiresAt: number }>();

// Periodic cleanup of expired memory records (every 5 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of memoryStore.entries()) {
      if (record.expiresAt < now) {
        memoryStore.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

/**
 * Atomic single-key rate limiter using Redis pipeline.
 */
export async function rateLimit(
  key: string,
  limit: number = 5,
  windowSeconds: number = 15 * 60
): Promise<RateLimitResult> {
  const prefixedKey = `ratelimit:${key}`;
  const now = Date.now();

  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      // Use atomic pipeline to avoid race conditions and orphan keys without TTL
      const pipeline = redis.pipeline();
      pipeline.incr(prefixedKey);
      pipeline.ttl(prefixedKey);
      const results = await pipeline.exec();

      if (results && results[0] && !results[0][0]) {
        const current = Number(results[0][1]);
        let ttl = Number(results[1]?.[1]);

        // If key is new or missing TTL (-1 or -2), set expiration
        if (ttl <= 0 || current === 1) {
          await redis.expire(prefixedKey, windowSeconds);
          ttl = windowSeconds;
        }

        const retryAfterSeconds = current > limit ? Math.max(1, ttl) : 0;
        const resetTimeMs = now + ttl * 1000;

        return {
          allowed: current <= limit,
          remaining: Math.max(0, limit - current),
          resetTimeMs,
          retryAfterSeconds,
        };
      }
    }
  } catch (err: any) {
    console.warn('[RateLimit] Redis unreachable, falling back to memory store:', err.message);
  }

  // Memory Store Fallback
  const record = memoryStore.get(prefixedKey);
  if (!record || record.expiresAt < now) {
    const expiresAt = now + windowSeconds * 1000;
    memoryStore.set(prefixedKey, { count: 1, expiresAt });
    return {
      allowed: true,
      remaining: limit - 1,
      resetTimeMs: expiresAt,
      retryAfterSeconds: 0,
    };
  }

  record.count += 1;
  const remaining = Math.max(0, limit - record.count);
  const ttlSec = Math.max(1, Math.ceil((record.expiresAt - now) / 1000));
  const retryAfterSeconds = record.count > limit ? ttlSec : 0;

  return {
    allowed: record.count <= limit,
    remaining,
    resetTimeMs: record.expiresAt,
    retryAfterSeconds,
  };
}

/**
 * Dual-Bucket Login Rate Limiter (Defends against both password spraying and credential stuffing).
 * Bucket 1: IP Bucket (e.g. 30 requests / 15 min across any username)
 * Bucket 2: User Bucket (e.g. 10 attempts / 15 min per username hash)
 * Username is hashed (SHA-256 slice 16) to prevent arbitrary Redis key explosion.
 */
export async function checkDualLoginRateLimit(
  ip: string,
  username: string,
  options: { ipLimit?: number; userLimit?: number; windowSeconds?: number } = {}
): Promise<{ allowed: boolean; retryAfterSeconds: number; reason?: string }> {
  const ipLimit = options.ipLimit ?? 30;
  const userLimit = options.userLimit ?? 10;
  const windowSeconds = options.windowSeconds ?? 15 * 60;

  // 1. Sanitize & hash username to prevent key bloat
  const cleanUsername = String(username || '').trim().toLowerCase();
  const usernameHash = crypto.createHash('sha256').update(cleanUsername).digest('hex').slice(0, 16);

  const ipKey = `login:ip:${ip}`;
  const userKey = `login:user:${usernameHash}`;

  // Check IP bucket
  const ipCheck = await rateLimit(ipKey, ipLimit, windowSeconds);
  if (!ipCheck.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: ipCheck.retryAfterSeconds,
      reason: 'IP_LIMIT_EXCEEDED',
    };
  }

  // Check User bucket
  const userCheck = await rateLimit(userKey, userLimit, windowSeconds);
  if (!userCheck.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: userCheck.retryAfterSeconds,
      reason: 'USER_LIMIT_EXCEEDED',
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}

/**
 * Resets user rate limit counter upon successful authentication.
 */
export async function resetLoginRateLimit(ip: string, username: string): Promise<void> {
  const cleanUsername = String(username || '').trim().toLowerCase();
  const usernameHash = crypto.createHash('sha256').update(cleanUsername).digest('hex').slice(0, 16);

  const ipKey = `ratelimit:login:ip:${ip}`;
  const userKey = `ratelimit:login:user:${usernameHash}`;

  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      await redis.del(userKey);
    }
  } catch {}

  memoryStore.delete(userKey);
}
