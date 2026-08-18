import { MongoClient, Db } from 'mongodb';

const PRIMARY_URI = process.env.MONGODB_URI || 'mongodb://192.168.1.20:27017/wazuh';
const FALLBACK_URI = process.env.MONGODB_FALLBACK_URI || 'mongodb://192.168.1.20:27017/wazuh';

let activeClientPromise: Promise<MongoClient> | null = null;
let activeUriUsed: string = PRIMARY_URI;
let lastFailureTime: number = 0;
const FAILURE_COOLDOWN_MS = 15000; // 15s cooldown to prevent repeated slow/hanging Mongo connection attempts

function connectToMongo(uri: string, timeoutMs = 300): Promise<MongoClient> {
  const client = new MongoClient(uri, {
    connectTimeoutMS: timeoutMs,
    socketTimeoutMS: 500,
    serverSelectionTimeoutMS: timeoutMs,
    maxPoolSize: 5,
  });

  const connectPromise = client.connect();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => {
      client.close(true).catch(() => {});
      reject(new Error(`MongoDB connection timeout (${timeoutMs}ms) for ${uri}`));
    }, timeoutMs)
  );

  return Promise.race([connectPromise, timeoutPromise]);
}

export async function getMongoClient(): Promise<MongoClient> {
  // Fast fail in 0ms if MongoDB recently failed (fallback to Redis instantly)
  if (Date.now() - lastFailureTime < FAILURE_COOLDOWN_MS) {
    throw new Error(`MongoDB cooling down after recent failure (${PRIMARY_URI})`);
  }

  if (activeClientPromise) {
    try {
      const client = await activeClientPromise;
      // Strict 200ms timeout race for admin ping to prevent hanging
      const pingPromise = client.db().admin().ping();
      const pingTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Mongo admin ping timeout (200ms)')), 200)
      );
      await Promise.race([pingPromise, pingTimeout]);
      return client;
    } catch {
      activeClientPromise = null;
    }
  }

  // Fast connect attempt to PRIMARY_URI (300ms limit)
  try {
    const client = await connectToMongo(PRIMARY_URI, 300);
    activeUriUsed = PRIMARY_URI;
    activeClientPromise = Promise.resolve(client);
    lastFailureTime = 0;
    return client;
  } catch (errPrimary: any) {
    // Only attempt FALLBACK_URI if it is different from PRIMARY_URI
    if (FALLBACK_URI !== PRIMARY_URI && !FALLBACK_URI.includes('192.168.1.11')) {
      try {
        const fallbackClient = await connectToMongo(FALLBACK_URI, 200);
        activeUriUsed = FALLBACK_URI;
        activeClientPromise = Promise.resolve(fallbackClient);
        lastFailureTime = 0;
        return fallbackClient;
      } catch {}
    }

    lastFailureTime = Date.now();
    activeClientPromise = null;
    throw new Error(`MongoDB connection unavailable on ${PRIMARY_URI}: ${errPrimary.message}`);
  }
}

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  const dbName = activeUriUsed.split('/').pop()?.split('?')[0] || 'wazuh';
  return client.db(dbName || 'wazuh');
}

export async function getIncidentsCollection() {
  const db = await getDb();
  return db.collection('incident');
}

export async function getVulnerabilitiesCollection() {
  const db = await getDb();
  return db.collection('vulnerability');
}

export async function getReportsCollection() {
  const db = await getDb();
  return db.collection('reports');
}
