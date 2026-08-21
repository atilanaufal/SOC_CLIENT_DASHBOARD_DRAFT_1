import { getIncidentsCollection, getVulnerabilitiesCollection, getReportsCollection } from './db';
import { getCache, setCache } from './redis';

export const REDIS_KEYS = {
  INCIDENTS_7D: 'incidents:1-7d',
  VULNERABILITIES_7D: 'vulnerabilities:1-7d',
  REPORTS_7D: 'reports:1-7d',
  STATS_TODAY: 'stats:today',
  STATS_7D: 'stats:7d',
};

// 7 days TTL in seconds (604800s)
const SEVEN_DAYS_TTL = 7 * 24 * 3600;

function isOneToSevenDaysFilter(range: string): boolean {
  if (!range) return true; // Default to short-term / today
  const lower = range.toLowerCase().trim();
  return lower === 'today' || lower === '7d' || lower === 'this week' || lower === '1w';
}

/**
 * Sync / Populate 1-7 Days Incidents into Redis from MongoDB
 */
export async function syncIncidentsToRedis(): Promise<any[]> {
  try {
    const collection = await getIncidentsCollection();
    const docs = await collection.find({}, { projection: { full_logs: 0 } }).sort({ _id: -1 }).toArray();

    // Filter documents from the last 7 days
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const sevenDaysDocs = docs.filter((doc) => {
      const rawDate = doc.last_observed || doc.first_observed || doc.date || doc.created_at;
      if (!rawDate) return false;
      const d = new Date(rawDate);
      return !isNaN(d.getTime()) && d >= sevenDaysAgo;
    });

    await setCache(REDIS_KEYS.INCIDENTS_7D, sevenDaysDocs, SEVEN_DAYS_TTL);
    return sevenDaysDocs;
  } catch (err: any) {
    console.warn('[Redis Sync] Failed to sync incidents to Redis:', err.message);
    return [];
  }
}

/**
 * Sync / Populate 1-7 Days Vulnerabilities into Redis from MongoDB
 */
export async function syncVulnerabilitiesToRedis(): Promise<any[]> {
  try {
    const collection = await getVulnerabilitiesCollection();
    const docs = await collection.find({}).sort({ _id: -1 }).toArray();

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const sevenDaysDocs = docs.filter((doc) => {
      const rawDate = doc.detected_at || doc.last_seen || doc.first_seen || doc.date || doc.created_at;
      if (!rawDate) return false;
      const d = new Date(rawDate);
      return !isNaN(d.getTime()) && d >= sevenDaysAgo;
    });

    await setCache(REDIS_KEYS.VULNERABILITIES_7D, sevenDaysDocs, SEVEN_DAYS_TTL);
    return sevenDaysDocs;
  } catch (err: any) {
    console.warn('[Redis Sync] Failed to sync vulnerabilities to Redis:', err.message);
    return [];
  }
}

import { getActiveRedisClient } from './redis';

async function fetchFromRedisHashes(): Promise<any[]> {
  try {
    const client = await getActiveRedisClient();
    if (!client) return [];
    if (client.status === 'wait' || client.status === 'close') {
      await client.connect();
    }
    const keys = await client.keys('wazuh:incident:*');
    if (!keys || keys.length === 0) return [];

    const docs: any[] = [];
    for (const key of keys) {
      const hashData = await client.hgetall(key);
      for (const val of Object.values(hashData)) {
        try {
          docs.push(JSON.parse(val));
        } catch {}
      }
    }
    return docs;
  } catch (err: any) {
    console.warn('[Redis Hash Read Error]:', err.message);
    return [];
  }
}

/**
 * Fetch Incidents:
 * - Reads real-time Redis Hashes (wazuh:incident:*)
 * - Falls back to direct MongoDB queries if Redis is empty/offline
 */
export async function fetchIncidentsData(timeRange: string): Promise<{ data: any[]; source: 'redis' | 'mongodb' }> {
  // 1. First priority: Read live Redis hashes (wazuh:incident:*)
  const redisHashDocs = await fetchFromRedisHashes();
  if (redisHashDocs.length > 0) {
    return { data: redisHashDocs, source: 'redis' };
  }

  // 2. Query MongoDB
  try {
    const collection = await getIncidentsCollection();
    const docs = await collection.find({}, { projection: { full_logs: 0 } }).sort({ _id: -1 }).toArray();
    return { data: docs, source: 'mongodb' };
  } catch (err: any) {
    console.warn('[MongoDB Fetch Error] Falling back to Redis cache:', err.message);
    const cached = await getCache<any[]>(REDIS_KEYS.INCIDENTS_7D);
    if (cached && Array.isArray(cached)) {
      return { data: cached, source: 'redis' };
    }
    return { data: [], source: 'redis' };
  }
}

/**
 * Fetch Vulnerabilities:
 * - 1-7 Days: Query Redis (fallback Mongo & cache)
 * - 1 Month / All: Query MongoDB directly (fallback Redis)
 */
export async function fetchVulnerabilitiesData(timeRange?: string): Promise<{ data: any[]; source: 'redis' | 'mongodb' }> {
  try {
    const collection = await getVulnerabilitiesCollection();
    const docs = await collection.find({}).sort({ _id: -1 }).toArray();
    if (docs && docs.length > 0) {
      setCache(REDIS_KEYS.VULNERABILITIES_7D, docs, SEVEN_DAYS_TTL).catch(() => {});
      return { data: docs, source: 'mongodb' };
    }
  } catch (err: any) {
    console.warn('[MongoDB Fetch Error] Falling back to Redis cache for vulnerabilities:', err.message);
  }

  const cached = await getCache<any[]>(REDIS_KEYS.VULNERABILITIES_7D);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return { data: cached, source: 'redis' };
  }

  return { data: [], source: 'mongodb' };
}
