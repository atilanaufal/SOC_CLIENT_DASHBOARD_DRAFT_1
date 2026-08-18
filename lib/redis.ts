import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || '192.168.1.20';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (redisClient) {
    return redisClient;
  }

  try {
    redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      connectTimeout: 2000,
      commandTimeout: 2000,
      maxRetriesPerRequest: 2,
      retryStrategy(times) {
        if (times > 3) {
          return null; // stop retrying after 3 attempts
        }
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      console.warn('[Redis] Connection warning:', err.message);
    });

    return redisClient;
  } catch (err: any) {
    console.warn('[Redis] Initialization failed:', err.message);
    return null;
  }
}

export async function isRedisAvailable(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    const pingRes = await client.ping();
    return pingRes === 'PONG';
  } catch {
    return false;
  }
}

/**
  * Retrieve JSON parsed value from Redis by key
  */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const client = getRedisClient();
    if (!client) return null;

    if (client.status === 'wait') {
      await client.connect();
    }

    const data = await client.get(key);
    if (!data) return null;

    return JSON.parse(data) as T;
  } catch (err: any) {
    console.warn(`[Redis Cache GET Error - Key ${key}]:`, err.message);
    return null;
  }
}

/**
  * Store JSON stringified value into Redis with optional TTL (default 7 days = 604800s)
  */
export async function setCache(key: string, value: any, ttlSeconds: number = 7 * 24 * 3600): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!client) return false;

    if (client.status === 'wait') {
      await client.connect();
    }

    const serialized = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await client.set(key, serialized);
    }
    return true;
  } catch (err: any) {
    console.warn(`[Redis Cache SET Error - Key ${key}]:`, err.message);
    return false;
  }
}

/**
  * Delete cache key from Redis
  */
export async function delCache(key: string): Promise<boolean> {
  try {
    const client = getRedisClient();
    if (!client) return false;

    if (client.status === 'wait') {
      await client.connect();
    }

    await client.del(key);
    return true;
  } catch {
    return false;
  }
}
