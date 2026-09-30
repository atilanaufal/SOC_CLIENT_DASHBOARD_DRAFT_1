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
const DEFAULT_SESSION_TTL_SECONDS = 15 * 60; // 15 minutes

// In-memory fallback for local dev or when Redis is temporarily reconnecting
const localMemoryStore = new Map<string, { data: ServerSessionData; expiresAt: number }>();

// Clean up expired in-memory items periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, item] of localMemoryStore.entries()) {
      if (item.expiresAt < now) {
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
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Fetches server-side session data.
 * Returns null if session is missing, revoked, or expired.
 */
export async function getServerSession(
  sessionId: string
): Promise<ServerSessionData | null> {
  if (!sessionId) return null;

  const key = `${SESSION_PREFIX}${sessionId}`;

  try {
    const redis = await getActiveRedisClient();
    if (redis) {
      const val = await redis.get(key);
      if (!val) return null;
      return JSON.parse(val) as ServerSessionData;
    }
  } catch (err: any) {
    console.warn('[SessionStore] Redis get failed, checking memory fallback:', err.message);
  }

  const memItem = localMemoryStore.get(sessionId);
  if (memItem && memItem.expiresAt > Date.now()) {
    return memItem.data;
  }

  return null;
}

/**
 * Updates the last_active timestamp and refreshes the inactivity TTL (rolling session).
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
        parsed.lastActive = now;
        await redis.set(key, JSON.stringify(parsed), 'EX', ttlSeconds);
        return;
      }
    }
  } catch (err: any) {
    console.warn('[SessionStore] Redis touch failed:', err.message);
  }

  const memItem = localMemoryStore.get(sessionId);
  if (memItem && memItem.expiresAt > now) {
    memItem.data.lastActive = now;
    memItem.expiresAt = now + ttlSeconds * 1000;
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
