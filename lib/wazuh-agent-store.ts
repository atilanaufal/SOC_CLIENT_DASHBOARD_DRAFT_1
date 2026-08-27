import { getActiveRedisClient } from './redis';
import { getDb } from './db';
import { TenantContext } from './tenant-context';

export interface WazuhDevice {
  id: string;
  name: string;
  agent?: string;
  ip: string;
  status: 'Online' | 'Offline' | string;
  raw_status?: string;
  version?: string;
  os?: string;
  os_name?: string;
  group?: string[];
  date_add?: string;
  last_keepalive?: string;
  cpu?: string;
  cores?: string;
  ram?: string;
  hardware?: {
    cpu_name?: string;
    cores?: string | number;
    ram_total?: string;
  };
  tenant_code?: string;
  campus_name?: string;
  updated_at?: string;
}

export interface WazuhDeviceSummary {
  tenant_code?: string;
  campus_name?: string;
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  os_distribution: Record<string, number>;
  updated_at?: string;
}

/**
 * Mengambil daftar devices tenant:
 * - Prioritas 1: Redis In-Memory Cache (<tenant.redisPrefix>:devices:list) -> < 1ms
 * - Prioritas 2 (Fallback Safety Net): MongoDB (<tenant.databaseName>.devices) -> 5-10ms
 */
export async function getTenantDevices(
  tenant: TenantContext
): Promise<{ data: WazuhDevice[]; source: 'redis' | 'mongodb' }> {
  const redisKey = `${tenant.redisPrefix}:devices:list`;

  // 1. PRIORITAS 1: Baca Cepat dari Redis
  try {
    const redisClient = await getActiveRedisClient();
    if (redisClient) {
      const cached = await redisClient.get(redisKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          return { data: parsed, source: 'redis' };
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Wazuh Agent Store] Redis read error for ${redisKey}:`, err.message);
  }

  // 2. PRIORITAS 2: Fallback ke MongoDB
  try {
    const db = await getDb(tenant.databaseName);
    const docs = await db.collection<WazuhDevice>('devices').find({}, { projection: { _id: 0 } }).toArray();
    return { data: docs || [], source: 'mongodb' };
  } catch (err: any) {
    console.error(`[Wazuh Agent Store] MongoDB fetch error for DB ${tenant.databaseName}:`, err.message);
    return { data: [], source: 'mongodb' };
  }
}

/**
 * Mengambil ringkasan summary devices tenant:
 * - Prioritas 1: Redis (<tenant.redisPrefix>:devices:summary)
 * - Prioritas 2 (Fallback): MongoDB (<tenant.databaseName>.device_summary)
 */
export async function getTenantDeviceSummary(
  tenant: TenantContext
): Promise<{ data: WazuhDeviceSummary; source: 'redis' | 'mongodb' }> {
  const redisKey = `${tenant.redisPrefix}:devices:summary`;

  // 1. PRIORITAS 1: Baca Cepat dari Redis
  try {
    const redisClient = await getActiveRedisClient();
    if (redisClient) {
      const cached = await redisClient.get(redisKey);
      if (cached) {
        const parsed = JSON.parse(cached) as WazuhDeviceSummary;
        if (parsed && typeof parsed.total_devices === 'number') {
          return { data: parsed, source: 'redis' };
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Wazuh Agent Store] Redis summary read error for ${redisKey}:`, err.message);
  }

  // 2. PRIORITAS 2: Fallback ke MongoDB
  try {
    const db = await getDb(tenant.databaseName);
    const sumDoc = await db.collection<WazuhDeviceSummary>('device_summary').findOne(
      { tenant_code: tenant.tenantCode },
      { projection: { _id: 0 } }
    );
    if (sumDoc) {
      return { data: sumDoc, source: 'mongodb' };
    }

    // Jika belum ada dokumen summary di DB, kalkulasi cepat dari koleksi devices
    const devices = await db.collection<WazuhDevice>('devices').find({}, { projection: { _id: 0 } }).toArray();
    let online = 0;
    let offline = 0;
    const osMap: Record<string, number> = {};

    devices.forEach((d) => {
      if (String(d.status).toLowerCase() === 'online') online++;
      else offline++;
      const os = typeof d.os === 'string' ? d.os : (d.os_name || 'Linux / Unix');
      osMap[os] = (osMap[os] || 0) + 1;
    });

    const calculatedSummary: WazuhDeviceSummary = {
      tenant_code: tenant.tenantCode,
      campus_name: tenant.campusName,
      total_devices: devices.length,
      online_devices: online,
      offline_devices: offline,
      os_distribution: osMap,
    };

    return { data: calculatedSummary, source: 'mongodb' };
  } catch (err: any) {
    console.error(`[Wazuh Agent Store] MongoDB summary fetch error:`, err.message);
    return {
      data: {
        total_devices: 0,
        online_devices: 0,
        offline_devices: 0,
        os_distribution: {},
      },
      source: 'mongodb',
    };
  }
}

/**
 * Mengambil detail hardware spesifik satu agent:
 * - Prioritas 1: Redis (<tenant.redisPrefix>:device:<id>)
 * - Prioritas 2: Fallback MongoDB (<tenant.databaseName>.devices WHERE id = agentId)
 */
export async function getTenantDeviceHardware(
  agentId: string,
  tenant: TenantContext
): Promise<{ data: Record<string, any>; source: 'redis' | 'mongodb' }> {
  const redisDevKey = `${tenant.redisPrefix}:device:${agentId}`;

  // 1. PRIORITAS 1: Baca Cepat dari Redis
  try {
    const redisClient = await getActiveRedisClient();
    if (redisClient) {
      const cached = await redisClient.get(redisDevKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          data: {
            cpuName: parsed.cpu || 'x86_64 / ARM',
            cores: parsed.cores || 'Dynamic',
            ramTotal: parsed.ram || 'Dynamic',
          },
          source: 'redis',
        };
      }
    }
  } catch {}

  // 2. PRIORITAS 2: Fallback ke MongoDB
  try {
    const db = await getDb(tenant.databaseName);
    const dev = await db.collection<WazuhDevice>('devices').findOne({ id: agentId });
    if (dev) {
      return {
        data: {
          cpuName: dev.cpu || dev.hardware?.cpu_name || 'x86_64 / ARM',
          cores: dev.cores || (dev.hardware?.cores ? String(dev.hardware.cores) : 'Dynamic'),
          ramTotal: dev.ram || dev.hardware?.ram_total || 'Dynamic',
        },
        source: 'mongodb',
      };
    }
  } catch {}

  return {
    data: { cpuName: 'N/A', cores: 'N/A', ramTotal: 'N/A' },
    source: 'mongodb',
  };
}
