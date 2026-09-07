import { MongoClient, Db } from 'mongodb';

const PRIMARY_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const FALLBACK_URI = process.env.MONGODB_FALLBACK_URI || '';

interface MongoCache {
  client: MongoClient | null;
  promise: Promise<MongoClient> | null;
  uriUsed: string;
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoCache: MongoCache | undefined;
}

const cache: MongoCache = global._mongoCache || {
  client: null,
  promise: null,
  uriUsed: PRIMARY_URI,
};

if (process.env.NODE_ENV !== 'production') {
  global._mongoCache = cache;
}

async function createClient(uri: string): Promise<MongoClient> {
  const client = new MongoClient(uri, {
    maxPoolSize: 20,
    minPoolSize: 2,
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 30000,
  });
  await client.connect();
  return client;
}

export async function getMongoClient(): Promise<MongoClient> {
  if (cache.promise) {
    try {
      const client = await cache.promise;
      return client;
    } catch {
      cache.promise = null;
      cache.client = null;
    }
  }

  cache.promise = (async () => {
    try {
      const client = await createClient(PRIMARY_URI);
      cache.client = client;
      cache.uriUsed = PRIMARY_URI;
      return client;
    } catch (primaryErr: any) {
      if (FALLBACK_URI && FALLBACK_URI !== PRIMARY_URI) {
        try {
          const fallbackClient = await createClient(FALLBACK_URI);
          cache.client = fallbackClient;
          cache.uriUsed = FALLBACK_URI;
          return fallbackClient;
        } catch {}
      }
      cache.promise = null;
      cache.client = null;
      throw new Error(`MongoDB connection unavailable: ${primaryErr.message}`);
    }
  })();

  return cache.promise;
}

export function getActiveMongoHost(): string {
  try {
    const parsed = new URL(cache.uriUsed);
    return parsed.host || '127.0.0.1:27017';
  } catch {
    const match = cache.uriUsed.match(/\/\/(.*?)\//);
    return match ? match[1] : '127.0.0.1:27017';
  }
}

export async function getDb(databaseName: string): Promise<Db> {
  if (!databaseName || typeof databaseName !== 'string') {
    throw new Error('Database name is required for multi-tenant isolation.');
  }
  const client = await getMongoClient();
  return client.db(databaseName);
}

export async function getIncidentsCollection(databaseName: string) {
  const db = await getDb(databaseName);
  return db.collection('incident');
}

export async function getVulnerabilitiesCollection(databaseName: string) {
  const db = await getDb(databaseName);
  return db.collection('vulnerability');
}

export async function getReportsCollection(databaseName: string) {
  const db = await getDb(databaseName);
  return db.collection('reports');
}

export async function getHistoricalStatisticsCollection(databaseName: string) {
  const db = await getDb(databaseName);
  return db.collection('historical_statistics');
}
