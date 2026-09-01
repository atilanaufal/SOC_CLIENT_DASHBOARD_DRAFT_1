import { MongoClient, Db } from 'mongodb';


const PRIMARY_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const FALLBACK_URI = process.env.MONGODB_FALLBACK_URI || '';


let activeClientPromise: Promise<MongoClient> | null = null;
let activeUriUsed: string = PRIMARY_URI;
let lastFailureTime: number = 0;
const FAILURE_COOLDOWN_MS = 15000; // 15s cooldown to prevent repeated slow/hanging Mongo connection attempts

function connectToMongo(uri: string, timeoutMs = 2500): Promise<MongoClient> {
  const client = new MongoClient(uri, {
    connectTimeoutMS: timeoutMs,
    socketTimeoutMS: 5000,
    serverSelectionTimeoutMS: timeoutMs,

    maxPoolSize: 20,

  });

  const connectPromise = client.connect();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => {
      client.close(true).catch(() => {});
      reject(new Error(`MongoDB connection timeout (${timeoutMs}ms)`));
    }, timeoutMs)
  );

  return Promise.race([connectPromise, timeoutPromise]);
}

export async function getMongoClient(): Promise<MongoClient> {
  // Fast fail if MongoDB recently failed
  if (Date.now() - lastFailureTime < FAILURE_COOLDOWN_MS) {
    throw new Error('MongoDB cooling down after recent failure');
  }

  if (activeClientPromise) {
    try {
      const client = await activeClientPromise;
      const pingPromise = client.db().admin().ping();
      const pingTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Mongo admin ping timeout (300ms)')), 300)
      );
      await Promise.race([pingPromise, pingTimeout]);
      return client;
    } catch {
      activeClientPromise = null;
    }
  }

  // Connect attempt to PRIMARY_URI
  try {
    const client = await connectToMongo(PRIMARY_URI, 500);
    activeUriUsed = PRIMARY_URI;
    activeClientPromise = Promise.resolve(client);
    lastFailureTime = 0;
    return client;
  } catch (errPrimary: any) {
    // Only attempt FALLBACK_URI if defined and different
    if (FALLBACK_URI && FALLBACK_URI !== PRIMARY_URI) {
      try {
        const fallbackClient = await connectToMongo(FALLBACK_URI, 400);
        activeUriUsed = FALLBACK_URI;
        activeClientPromise = Promise.resolve(fallbackClient);
        lastFailureTime = 0;
        return fallbackClient;
      } catch {}
    }

    lastFailureTime = Date.now();
    activeClientPromise = null;
    throw new Error(`MongoDB connection unavailable: ${errPrimary.message}`);
  }
}

export function getActiveMongoHost(): string {
  try {
    const parsed = new URL(activeUriUsed);

    return parsed.host || '127.0.0.1:27017';
  } catch {
    const match = activeUriUsed.match(/\/\/(.*?)\//);
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
