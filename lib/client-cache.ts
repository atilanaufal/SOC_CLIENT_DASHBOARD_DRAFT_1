// In-Memory Client Cache Engine
// - State persists in memory during SPA navigation between pages (Dashboard, Incidents, Vulnerabilities, Devices)
// - Automatically resets and queries fresh from the database whenever the browser is refreshed (F5 / reload)

const memoryCache = new Map<string, any>();

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Initializes client session.
 * Cleans up any legacy IndexedDB if present from previous builds.
 */
export function initClientSession(): void {
  if (!isBrowser()) return;
  try {
    if (window.indexedDB && window.indexedDB.deleteDatabase) {
      window.indexedDB.deleteDatabase('infoguard_client_cache_db');
    }
  } catch {}
}

/**
 * Retrieves cached data by key from fast in-memory store.
 * Returns null if not in memory (e.g. upon fresh page reload / F5).
 */
export async function getClientCache<T>(key: string): Promise<T | null> {
  if (!isBrowser()) return null;
  if (memoryCache.has(key)) {
    return memoryCache.get(key) as T;
  }
  return null;
}

/**
 * Sets data into in-memory cache for SPA navigation persistence.
 */
export async function setClientCache(key: string, data: any): Promise<void> {
  if (!isBrowser()) return;
  memoryCache.set(key, data);
}

/**
 * Removes a specific cache key or keys starting with prefix.
 */
export async function invalidateClientCache(keyOrPrefix?: string): Promise<void> {
  if (!isBrowser()) return;

  if (!keyOrPrefix) {
    memoryCache.clear();
    return;
  }

  for (const k of Array.from(memoryCache.keys())) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) {
      memoryCache.delete(k);
    }
  }
}
