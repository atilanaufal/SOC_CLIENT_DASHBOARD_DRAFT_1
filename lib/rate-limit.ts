import { getActiveRedisClient } from './redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTimeMs: number;
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
 * Rate limit check based on key, max hits, and window duration in seconds.
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
      const current = await redis.incr(prefixedKey);
      if (current === 1) {
        await redis.expire(prefixedKey, windowSeconds);
      }
      const ttl = await redis.ttl(prefixedKey);
      const resetTimeMs = now + (ttl > 0 ? ttl : windowSeconds) * 1000;

      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetTimeMs,
      };
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
    };
  }

  record.count += 1;
  const remaining = Math.max(0, limit - record.count);
  return {
    allowed: record.count <= limit,
    remaining,
    resetTimeMs: record.expiresAt,
  };
}

/**
 * Reset rate limit counter for a specific key (e.g. after successful authentication).
 */
export async function resetRateLimit(key: string): Promise<void> {
  const prefixedKey = `ratelimit:${key}`;
  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      await redis.del(prefixedKey);
    }
  } catch {}
  memoryStore.delete(prefixedKey);
}
