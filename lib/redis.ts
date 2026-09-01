import Redis from 'ioredis';

function getRedisConfig() {

  const primaryHost = process.env.REDIS_HOST || '127.0.0.1';
  const primaryPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const primaryPassword = process.env.REDIS_PASSWORD || undefined;

  const fallbackHost = process.env.REDIS_FALLBACK_HOST || '';

  const fallbackPort = parseInt(process.env.REDIS_FALLBACK_PORT || process.env.REDIS_PORT || '6379', 10);
  const fallbackPassword = process.env.REDIS_FALLBACK_PASSWORD || process.env.REDIS_PASSWORD || undefined;

  return {
    primary: { host: primaryHost, port: primaryPort, password: primaryPassword },
    fallback: { host: fallbackHost, port: fallbackPort, password: fallbackPassword },
  };
}

let primaryClient: Redis | null = null;
let fallbackClient: Redis | null = null;
let activeClient: Redis | null = null;

let activeHost: string = process.env.REDIS_HOST || '127.0.0.1';

let activePort: number = parseInt(process.env.REDIS_PORT || '6379', 10);

let lastPrimaryFailTime = 0;
const PRIMARY_FAIL_COOLDOWN_MS = 15000; // 15s cooldown before retrying primary

function createClientInstance(host: string, port: number, password?: string): Redis {
  const client = new Redis({
    host,
    port,
    password,

    connectTimeout: 3000,
    commandTimeout: 3000,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: true,
    retryStrategy(times) {
      return Math.min(times * 300, 3000);
    },
    lazyConnect: false,

  });

  client.on('error', (_err) => {
    // Suppress unhandled error crashes
  });

  return client;
}

export function getActiveRedisHost(): { host: string; port: number } {
  return { host: activeHost, port: activePort };
}

/**
 * Connect and verify ping with given Redis client
 */
async function testClientConnection(client: Redis): Promise<boolean> {
  try {
    if (client.status === 'wait' || client.status === 'close') {
      await client.connect();
    }
    const pingRes = await client.ping();
    return pingRes === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Returns the currently active and connected Redis client, automatically handling failover to fallback
 */
export async function getActiveRedisClient(): Promise<Redis | null> {
  const { primary, fallback } = getRedisConfig();
  const now = Date.now();


  // 1. Try Primary if not in cooldown
  if (now - lastPrimaryFailTime > PRIMARY_FAIL_COOLDOWN_MS) {
    try {
      if (!primaryClient || primaryClient.status === 'end') {
        if (primaryClient) {
          try { primaryClient.disconnect(); } catch {}
        }
        primaryClient = createClientInstance(primary.host, primary.port, primary.password);
      }
      const ok = await testClientConnection(primaryClient);
      if (ok) {
        activeClient = primaryClient;
        activeHost = primary.host;
        activePort = primary.port;
        lastPrimaryFailTime = 0;
        return primaryClient;
      } else {
        lastPrimaryFailTime = now;
      }
    } catch {
      lastPrimaryFailTime = now;
    }

  }

  // 2. Try Fallback if primary is failing or in cooldown
  const isFallbackDifferent = fallback.host && (fallback.host !== primary.host || fallback.port !== primary.port);
  if (isFallbackDifferent && fallback.host) {
    try {
      if (!fallbackClient || fallbackClient.status === 'end') {
        if (fallbackClient) {
          try { fallbackClient.disconnect(); } catch {}
        }
        fallbackClient = createClientInstance(fallback.host, fallback.port, fallback.password);
      }
      const ok = await testClientConnection(fallbackClient);
      if (ok) {
        activeClient = fallbackClient;
        activeHost = fallback.host;
        activePort = fallback.port;
        return fallbackClient;
      }
    } catch (err: any) {
      console.warn(`[Redis Fallback ${fallback.host}:${fallback.port}] Connection failed:`, err.message);
    }
  }

  // Fallback also down, or primary only
  if (activeClient && (activeClient.status === 'ready' || activeClient.status === 'connect')) {
    return activeClient;
  }

  return null;
}

/**
 * Synchronous accessor for compatibility
 */
export function getRedisClient(): Redis | null {
  if (activeClient && (activeClient.status === 'ready' || activeClient.status === 'connect')) {
    return activeClient;
  }
  return null;
}

export async function isRedisAvailable(): Promise<boolean> {
  const client = await getActiveRedisClient();
  return client !== null;
}

/**
 * Retrieve JSON parsed value from Redis by key
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const client = await getActiveRedisClient();
    if (!client) return null;

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
    const client = await getActiveRedisClient();
    if (!client) return false;

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
    const client = await getActiveRedisClient();
    if (!client) return false;

    await client.del(key);
    return true;
  } catch {
    return false;
  }
}
