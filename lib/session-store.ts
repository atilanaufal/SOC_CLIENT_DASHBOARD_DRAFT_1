import { getActiveRedisClient } from './redis';

export interface ServerSessionData {
  sessionId: string;
  userId: number | string;
  username: string;
  role: string;
  createdAt: number;
  lastActive: number;
}

const SESSION_PREFIX = 'asoc:session:';
const DEFAULT_SESSION_TTL_SECONDS = 15 * 60; // 15 minutes idle timeout
export const MAX_SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000; // 12 hours absolute ceiling

// In-memory fallback for local dev or when Redis is temporarily reconnecting
const localMemoryStore = new Map<string, { data: ServerSessionData; expiresAt: number; absoluteExpiresAt: number }>();

// Clean up expired in-memory items periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, item] of localMemoryStore.entries()) {
      if (item.expiresAt < now || item.absoluteExpiresAt < now) {
        localMemoryStore.delete(key);
      }
    }
  }, 60 * 1000).unref?.();
}

/**
 * Stores a new authenticated session in server-side storage (Redis).
 */
export async function createServerSession(
  sessionId: string,
  data: ServerSessionData,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<void> {
  const key = `${SESSION_PREFIX}${sessionId}`;
  const serialized = JSON.stringify(data);
  const now = Date.now();

  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      await redis.set(key, serialized, 'EX', ttlSeconds);
      return;
    }
  } catch (err: any) {
    console.warn('[SessionStore] Redis store failed, falling back to in-memory:', err.message);
  }

  // In-memory fallback
  localMemoryStore.set(sessionId, {
    data,
    expiresAt: now + ttlSeconds * 1000,
    absoluteExpiresAt: now + MAX_SESSION_ABSOLUTE_MS,
  });
}

/**
 * Fetches server-side session data.
 * Enforces both idle timeout and 12-hour absolute lifetime.
 * Returns null if session is missing, revoked, or expired.
 */
export async function getServerSession(
  sessionId: string
): Promise<ServerSessionData | null> {
  if (!sessionId) return null;

  const key = `${SESSION_PREFIX}${sessionId}`;
  const now = Date.now();

  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      const val = await redis.get(key);
      if (!val) return null;
      const parsed = JSON.parse(val) as ServerSessionData;

      // Absolute lifetime check (12 hours)
      if (now - parsed.createdAt > MAX_SESSION_ABSOLUTE_MS) {
        await redis.del(key);
        return null;
      }

      return parsed;
    }
  } catch (err: any) {
    console.warn('[SessionStore] Redis get failed, checking memory fallback:', err.message);
  }

  const memItem = localMemoryStore.get(sessionId);
  if (memItem && memItem.expiresAt > now && memItem.absoluteExpiresAt > now) {
    return memItem.data;
  }

  return null;
}

/**
 * Updates the last_active timestamp and refreshes the inactivity TTL (rolling session),
 * while strictly bounded by the 12-hour absolute expiration ceiling.
 */
export async function touchServerSession(
  sessionId: string,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<void> {
  if (!sessionId) return;

  const key = `${SESSION_PREFIX}${sessionId}`;
  const now = Date.now();

  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      const existing = await redis.get(key);
      if (existing) {
        const parsed = JSON.parse(existing) as ServerSessionData;

        // Check absolute ceiling
        const ageMs = now - parsed.createdAt;
        if (ageMs > MAX_SESSION_ABSOLUTE_MS) {
          await redis.del(key);
          return;
        }

        // Bound remaining TTL to absolute ceiling
        const remainingAbsoluteSeconds = Math.floor((MAX_SESSION_ABSOLUTE_MS - ageMs) / 1000);
        const effectiveTtl = Math.min(ttlSeconds, remainingAbsoluteSeconds);

        if (effectiveTtl <= 0) {
          await redis.del(key);
          return;
        }

        parsed.lastActive = now;
        await redis.set(key, JSON.stringify(parsed), 'EX', effectiveTtl);
        return;
      }
    }
  } catch (err: any) {
    console.warn('[SessionStore] Redis touch failed:', err.message);
  }

  const memItem = localMemoryStore.get(sessionId);
  if (memItem && memItem.expiresAt > now && memItem.absoluteExpiresAt > now) {
    memItem.data.lastActive = now;
    const remainingAbsoluteSeconds = Math.max(1, Math.floor((memItem.absoluteExpiresAt - now) / 1000));
    memItem.expiresAt = now + Math.min(ttlSeconds, remainingAbsoluteSeconds) * 1000;
  }
}

/**
 * Permanently revokes a session from server-side storage (e.g. upon user logout).
 */
export async function revokeServerSession(sessionId: string): Promise<void> {
  if (!sessionId) return;

  const key = `${SESSION_PREFIX}${sessionId}`;

  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      await redis.del(key);
    }
  } catch (err: any) {
    console.warn('[SessionStore] Redis revoke failed:', err.message);
  }

  localMemoryStore.delete(sessionId);
}
