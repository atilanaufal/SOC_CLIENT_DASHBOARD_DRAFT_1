import { getActiveRedisClient } from '@/lib/redis';
import { getDb, getIncidentsCollection, getVulnerabilitiesCollection, getReportsCollection, getHistoricalStatisticsCollection } from '@/lib/db';
import { Incident, Vulnerability, SecurityReport, Device } from '@/lib/types';

/**
 * Data Service (Dual-Tier Real-Time & Historical Architecture)
 * -------------------------------------------------------------
 * - Rentang 1-7 Hari (Today, This Week, 7d): Prioritas ke Redis In-Memory Cache (< 1ms).
 * - Rentang > 7 Hari (This Month, 30d, All, Custom): Query ke MongoDB Master untuk arsip penuh.
 * - Dilengkapi safety-net automatic fallback ke MongoDB jika Redis tidak tersedia/kosong.
 */

/**
 * Memeriksa apakah rentang waktu yang diminta berada dalam cakupan 1-7 hari (Redis Cache)
 */
export function isQueryForRecentDays(
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null
): boolean {
  if (!timeRange && !startDate && !endDate) {
    // Default mode: coba hot-cache Redis terlebih dahulu (1-7 hari)
    return true;
  }

  const lower = (timeRange || '').toLowerCase().trim();

  if (lower === 'today' || lower === 'this week' || lower === '7d') {
    return true;
  }

  if (lower === 'this month' || lower === '30d' || lower === 'all') {
    return false;
  }

  // Jika custom range atau rentang tanggal spesifik
  if (lower.startsWith('custom') || (startDate && endDate)) {
    let sStr = startDate;
    if (lower.includes(':')) {
      const parts = timeRange?.split(':')[1]?.split('_');
      if (parts && parts.length === 2) {
        sStr = parts[0];
      }
    }

    if (sStr) {
      const start = new Date(sStr.includes('T') ? sStr : `${sStr}T00:00:00.000`);
      if (!isNaN(start.getTime())) {
        const diffMs = Date.now() - start.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        return diffDays <= 7.5; // Berada dalam 7 hari terakhir
      }
    }
  }

  return true;
}

/**
 * Parser aman untuk dokumen/hash incident dari Redis maupun MongoDB
 */
function parseRawIncident(h: any, fallbackId: string): Incident {
  const incName = Array.isArray(h.incident_type)
    ? h.incident_type.join(', ')
    : (h.incident_type || h.incidentName || h.description || (h.rule_id || h.ruleId ? `Rule ${h.rule_id || h.ruleId}` : 'Security Event'));

  const firstObs = h.first_observed || h.timeObserved || h.last_observed || h.date || h.created_at || new Date().toISOString();
  const lastObs = h.last_observed || h.timeObserved || h.first_observed || firstObs;

  const mitreTechnique = Array.isArray(h.mitre_technique)
    ? h.mitre_technique.join(', ')
    : (h.mitre_technique || h.mitre || h.mitre_id || '');

  const mitreId = Array.isArray(h.mitre_id)
    ? h.mitre_id.join(', ')
    : (h.mitre_id || '');

  const mitreTactic = Array.isArray(h.mitre_tactic)
    ? h.mitre_tactic.join(', ')
    : (h.mitre_tactic || '');

  let fullLogsString = '';
  if (typeof h.full_logs === 'string' && h.full_logs.trim()) {
    fullLogsString = h.full_logs;
  } else if (typeof h.full_log === 'string' && h.full_log.trim()) {
    fullLogsString = h.full_log;
  } else if (Array.isArray(h.full_logs)) {
    fullLogsString = h.full_logs.join('\n');
  } else if (h.full_logs && typeof h.full_logs === 'object') {
    fullLogsString = JSON.stringify(h.full_logs, null, 2);
  }

  const hostName = h.host || h.agent || h.agent_name || (h.agent_id ? `Agent ${h.agent_id}` : '');

  // Ensure unique ID per record
  const baseId = h._id ? String(h._id) : (h.id || h.incident_id ? String(h.id || h.incident_id) : '');
  const uniqueId = baseId && baseId !== incName ? baseId : `${fallbackId}_${firstObs}`;

  return {
    id: uniqueId,
    _id: uniqueId,
    incidentName: incName,
    incident_type: h.incident_type || incName,
    severity: (h.severity || 'Medium') as any,
    agent: hostName,
    agentsList: [hostName || 'Agent'],
    host: hostName,
    agent_id: h.agent_id ? String(h.agent_id) : (h.agent ? String(h.agent) : undefined),
    firstObserved: firstObs,
    first_observed: firstObs,
    lastObserved: lastObs,
    last_observed: lastObs,
    date: h.date || (typeof firstObs === 'string' ? firstObs.split('T')[0]?.split(' ')[0] : undefined),
    description: h.description || (Array.isArray(h.incident_type) ? h.incident_type.join(', ') : h.incident_type) || incName,
    mitre: mitreTechnique,
    mitre_id: mitreId,
    mitre_tactic: mitreTactic,
    mitre_technique: mitreTechnique,
    ruleId: String(h.rule_id || h.ruleId || ''),
    rule_id: String(h.rule_id || h.ruleId || ''),
    sourceIp: h.ip_source || h.agent_ip || h.sourceIp || '',
    agent_ip: h.agent_ip || h.ip_source || h.sourceIp || '',
    ip_source: h.ip_source || h.agent_ip || h.sourceIp || '',
    destIp: h.ip_destination || h.destIp || '',
    ip_destination: h.ip_destination || h.destIp || '',
    affected_file: h.affected_file || '',
    count: Number(h.count) || 1,
    full_logs: fullLogsString,
  };
}

/**
 * Parser aman untuk dokumen/hash vulnerability dari Redis maupun MongoDB
 */
function parseRawVulnerability(h: any, fallbackId: string): Vulnerability {
  const cve = h.cve || h.cveId || '';
  const pkgName = h.package_name || h.package || '';
  const vulnTitle = h.title || h.vulnerability || h.name || pkgName || cve || 'CVE Vulnerability';
  const detectDate = h.detected_at || h.detectionDate || h.last_seen || h.first_seen || h.created_at || new Date().toISOString();
  const agentName = h.host || h.agent || h.agent_name || (h.agent_id ? `Agent ${h.agent_id}` : '');
  const pkgVersion = h.version || h.currentVersion || h.package_version || 'N/A';

  const baseId = h._id ? String(h._id) : (h.id ? String(h.id) : (cve ? `${cve}_${agentName}_${pkgName}` : fallbackId));

  return {
    id: baseId,
    name: vulnTitle,
    vulnerability: vulnTitle,
    severity: (h.severity || 'Medium') as any,
    agent: agentName,
    cveId: cve || 'N/A',
    cve: cve || 'N/A',
    detectionDate: detectDate,
    detected_at: detectDate,
    status: (h.status || 'Active') as any,
    currentVersion: pkgVersion,
    version: pkgVersion,
    description: h.description || h.title || `Vulnerability ${cve} detected on ${pkgName || 'package'}`,
    impact: h.impact || '',
    category: h.category || 'Packages',
    package: pkgName || vulnTitle || '',
    ip: h.ip || h.agent_ip || '',
  };
}

/**
 * Mengambil data insiden tenant:
 * Mengambil data lengkap dari MongoDB Master sebagai Single Source of Truth
 */
export async function getTenantIncidents(
  databaseName: string,
  redisPrefix: string,
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<Incident[]> {
  try {
    const col = await getIncidentsCollection(databaseName);
    const docs = await col.find({}).sort({ last_observed: -1, first_observed: -1, _id: -1 }).toArray();

    if (docs && docs.length > 0) {
      return docs.map((doc: any, idx: number) => parseRawIncident(doc, `mongo-inc-${idx + 1}`));
    }
  } catch (mongoErr: any) {
    console.warn('[DataService] MongoDB incident query error, attempting Redis fallback:', mongoErr.message);
  }

  // Fallback ke Redis jika MongoDB tidak dapat diakses
  try {
    const cleanPrefix = (redisPrefix || databaseName).replace(/:+$/, '');
    const redis = await getActiveRedisClient();
    if (redis) {
      const keys = await redis.keys(`${cleanPrefix}:incident:*`);
      if (keys && keys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of keys) {
          pipeline.hgetall(key);
        }
        const results = await pipeline.exec();
        const incidents: Incident[] = [];
        if (results) {
          let itemIdx = 0;
          for (let i = 0; i < results.length; i++) {
            const [err, rawHash] = results[i];
            const redisKey = keys[i] || `key_${i}`;
            if (!err && rawHash && typeof rawHash === 'object') {
              for (const [fieldKey, fieldVal] of Object.entries(rawHash)) {
                try {
                  const parsed = typeof fieldVal === 'string' ? JSON.parse(fieldVal) : fieldVal;
                  if (parsed && typeof parsed === 'object') {
                    itemIdx++;
                    const uniqueFallback = `${redisKey}_${fieldKey}_${itemIdx}`;
                    incidents.push(parseRawIncident(parsed, uniqueFallback));
                  }
                } catch {}
              }
            }
          }
        }
        if (incidents.length > 0) {
          incidents.sort((a, b) => {
            const tA = new Date(a.lastObserved || a.firstObserved).getTime();
            const tB = new Date(b.lastObserved || b.firstObserved).getTime();
            return tB - tA;
          });
          return incidents;
        }
      }
    }
  } catch (redisErr: any) {
    console.error('[DataService] Redis incident query error:', redisErr.message);
  }

  return [];
}

/**
 * Mengambil data kerentanan (vulnerability) tenant:
 * Mengambil seluruh data lengkap dari MongoDB Master (semua 4000+ dokumen)
 */
export async function getTenantVulnerabilities(
  databaseName: string,
  redisPrefix: string,
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<Vulnerability[]> {
  try {
    const col = await getVulnerabilitiesCollection(databaseName);
    const docs = await col.find({}).sort({ detected_at: -1, created_at: -1, _id: -1 }).toArray();

    if (docs && docs.length > 0) {
      return docs.map((doc: any, idx: number) => parseRawVulnerability(doc, `mongo-vuln-${idx + 1}`));
    }
  } catch (mongoErr: any) {
    console.warn('[DataService] MongoDB vulnerability query error, attempting Redis fallback:', mongoErr.message);
  }

  // Fallback ke Redis jika MongoDB tidak dapat diakses
  try {
    const cleanPrefix = (redisPrefix || databaseName).replace(/:+$/, '');
    const redis = await getActiveRedisClient();
    if (redis) {
      let keys = await redis.keys(`${cleanPrefix}:vulnerability:*`);
      if (!keys || keys.length === 0) {
        keys = await redis.keys(`${cleanPrefix}:vulnerabilities:*`);
      }

      if (keys && keys.length > 0) {
        const pipeline = redis.pipeline();
        for (const key of keys) {
          pipeline.hgetall(key);
        }
        const results = await pipeline.exec();
        const vulns: Vulnerability[] = [];
        if (results) {
          for (const [err, rawHash] of results) {
            if (!err && rawHash && typeof rawHash === 'object') {
              for (const [fieldKey, fieldVal] of Object.entries(rawHash)) {
                try {
                  const parsed = typeof fieldVal === 'string' ? JSON.parse(fieldVal) : fieldVal;
                  if (parsed && typeof parsed === 'object') {
                    vulns.push(parseRawVulnerability(parsed, fieldKey));
                  }
                } catch {}
              }
            }
          }
        }
        if (vulns.length > 0) {
          vulns.sort((a, b) => {
            const tA = new Date(a.detected_at || a.detectionDate).getTime();
            const tB = new Date(b.detected_at || b.detectionDate).getTime();
            return tB - tA;
          });
          return vulns;
        }
      }
    }
  } catch (redisErr: any) {
    console.error('[DataService] Redis vulnerability query error:', redisErr.message);
  }

  return [];
}

export async function getTenantReports(databaseName: string): Promise<SecurityReport[]> {
  try {
    const col = await getReportsCollection(databaseName);
    const docs = await col.find({}).sort({ date_generated: -1, last_updated: -1 }).toArray();

    return docs.map((doc: any) => ({
      id: String(doc._id || doc.id || doc.report_uuid || Math.random()),
      reportName: doc.report_name || doc.reportName || 'Security Incident Analysis',
      report_name: doc.report_name || doc.reportName || 'Security Incident Analysis',
      report_id: doc.report_id || 1,
      report_uuid: doc.report_uuid || String(doc._id || ''),
      soc_id: doc.soc_id || '',
      type: doc.type || 'Automated Incident Response',
      dateGenerated: doc.date_generated || doc.dateGenerated || new Date().toISOString(),
      date_generated: doc.date_generated || doc.dateGenerated || new Date().toISOString(),
      severity: (doc.severity || 'Medium') as any,
      lastUpdated: doc.last_updated || doc.lastUpdated || doc.date_generated,
      summary: doc.summary || doc.description || '',
      affectedDevices: doc.affected_devices || doc.affectedDevices || [],
      ioc: doc.ioc || { mitre: '', sourceIp: '', targetUser: '' },
      findings: doc.findings || [],
      recommendedAction: doc.recommended_action || doc.recommendedAction || '',
      recommended_action: doc.recommended_action || doc.recommendedAction || '',
    }));
  } catch (err: any) {
    console.error('[DataService] MongoDB query error for reports:', err.message);
    return [];
  }
}

export async function getTenantDevices(databaseName: string): Promise<Device[]> {
  try {
    const db = await getDb(databaseName);
    const docs = await db.collection('devices').find({}).toArray();

    return docs.map((doc: any, index: number) => ({
      id: String(doc._id || doc.id || doc.agent_id || `dev-${index + 1}`),
      agent: doc.agent || doc.name || doc.hostname || '',
      os: doc.os || 'Linux',
      status: (doc.status === 'Online' || doc.status === 'active' ? 'Online' : 'Offline') as any,
      lastSeen: doc.last_seen || doc.lastSeen || '',
      cpu: doc.cpu || '',
      cores: doc.cores || '',
      ram: doc.ram || doc.memory || '',
      university: doc.university || '',
      tenant: doc.tenant || '',
      agentVersion: doc.agent_version || doc.agentVersion || '',
      ipAddress: doc.ip || doc.ip_address || doc.ipAddress || '',
      detectedIssues: doc.detected_issues || doc.detectedIssues || [],
      risk: doc.risk || 'Low',
      score: Number(doc.score) || 0,
      riskCategory: doc.risk_category || doc.riskCategory || 'Low',
      criticalCount: Number(doc.critical_count) || 0,
      highCount: Number(doc.high_count) || 0,
      mediumCount: Number(doc.medium_count) || 0,
      missingPatches: doc.missing_patches || doc.missingPatches || '0',
      protection: (doc.protection || (doc.status === 'Online' ? 'Protected' : 'Not Protected')) as any,
    }));
  } catch (err: any) {
    console.error('[DataService] MongoDB query error for devices:', err.message);
    return [];
  }
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Mengambil statistik perbandingan historis dari koleksi `historical_statistics` di MongoDB
 */
export async function getHistoricalComparisonStats(
  databaseName: string,
  timeFilter = 'Today',
  startDate?: string | null,
  endDate?: string | null
): Promise<{
  criticalPrev: number;
  highPrev: number;
  mediumPrev: number;
  lowPrev: number;
  totalPrev: number;
  riskPrev: number;
  periodLabel: string;
  found: boolean;
}> {
  try {
    const col = await getHistoricalStatisticsCollection(databaseName);
    const now = new Date();
    const lower = (timeFilter || 'today').toLowerCase();

    let startOfPrev: string;
    let endOfPrev: string;
    let periodLabel = 'YESTERDAY';

    if (lower === 'today') {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      startOfPrev = formatDateKey(yesterday);
      endOfPrev = startOfPrev;
      periodLabel = 'YESTERDAY';
    } else if (lower === 'this week' || lower === '7d') {
      const dayOfWeek = now.getDay();
      const diffToMonday = (dayOfWeek + 6) % 7;
      const mondayThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
      const startOfWeek = mondayThisWeek;
      const prevWeekStart = new Date(startOfWeek.getTime() - 7 * 24 * 3600 * 1000);
      const prevWeekEnd = new Date(startOfWeek.getTime() - 24 * 3600 * 1000);
      startOfPrev = formatDateKey(prevWeekStart);
      endOfPrev = formatDateKey(prevWeekEnd);
      periodLabel = 'LAST WEEK';
    } else if (lower === 'this month' || lower === '30d') {
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      startOfPrev = formatDateKey(prevMonthStart);
      endOfPrev = formatDateKey(prevMonthEnd);
      periodLabel = 'LAST MONTH';
    } else if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      const diffMs = Math.max(1, e.getTime() - s.getTime());
      const prevS = new Date(s.getTime() - diffMs);
      const prevE = new Date(s.getTime() - 24 * 3600 * 1000);
      startOfPrev = formatDateKey(prevS);
      endOfPrev = formatDateKey(prevE);
      periodLabel = 'PREVIOUS PERIOD';
    } else {
      startOfPrev = '1970-01-01';
      endOfPrev = '1970-01-01';
      periodLabel = 'PREVIOUS PERIOD';
    }

    let docs = await col.find({ date: { $gte: startOfPrev, $lte: endOfPrev } }).sort({ date: -1 }).toArray();

    // If today had no yesterday entry, try fetching the most recent entry before today
    if (docs.length === 0 && lower === 'today') {
      const todayStr = formatDateKey(now);
      const latestBeforeToday = await col.find({ date: { $lt: todayStr } }).sort({ date: -1 }).limit(1).toArray();
      if (latestBeforeToday.length > 0) {
        docs = latestBeforeToday;
      }
    }

    if (docs.length === 0) {
      return {
        criticalPrev: 0,
        highPrev: 0,
        mediumPrev: 0,
        lowPrev: 0,
        totalPrev: 0,
        riskPrev: 0,
        periodLabel,
        found: false,
      };
    }

    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let total = 0;
    let sumRisk = 0;

    docs.forEach((d: any) => {
      critical += (d.critical || 0);
      high += (d.high || 0);
      medium += (d.medium || 0);
      low += (d.low || 0);
      total += (d.totalSeverity !== undefined ? d.totalSeverity : ((d.critical || 0) + (d.high || 0) + (d.medium || 0) + (d.low || 0)));
      sumRisk += (d.riskScore || 0);
    });

    const avgRisk = docs.length > 0 ? Math.round((sumRisk / docs.length) * 10) / 10 : 0;

    return {
      criticalPrev: critical,
      highPrev: high,
      mediumPrev: medium,
      lowPrev: low,
      totalPrev: total,
      riskPrev: avgRisk,
      periodLabel,
      found: true,
    };
  } catch (err: any) {
    console.warn(`[getHistoricalComparisonStats] Error querying historical_statistics for DB ${databaseName}:`, err.message);
    return {
      criticalPrev: 0,
      highPrev: 0,
      mediumPrev: 0,
      lowPrev: 0,
      totalPrev: 0,
      riskPrev: 0,
      periodLabel: 'PREVIOUS PERIOD',
      found: false,
    };
  }
}
