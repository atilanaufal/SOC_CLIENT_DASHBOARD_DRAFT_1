import { getActiveRedisClient } from '@/lib/redis';
import { getDb, getIncidentsCollection, getVulnerabilitiesCollection, getReportsCollection, getHistoricalStatisticsCollection } from '@/lib/db';
import { Incident, Vulnerability, SecurityReport, Device } from '@/lib/types';
import { parseCustomDate, formatStandardDate, getTimestamp } from '@/lib/date-utils';
import { parseSeverity } from '@/lib/severity';
import { getRiskCategory } from '@/lib/risk-score';
import { groupAlertsToIncidents, mapAlertToItem, formatIncidentType } from '@/lib/incident-grouping';

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
  const rawIncType = Array.isArray(h.incident_type)
    ? h.incident_type.filter(Boolean).join(', ')
    : (h.incident_type ? String(h.incident_type).trim() : '');

  const incName = rawIncType || (h.rule_id || h.ruleId ? `Rule ${h.rule_id || h.ruleId}` : 'Security Event');

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const toLocalString = (v: any) => {
    if (!v) return '';
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      const y = v.getUTCFullYear();
      const m = pad2(v.getUTCMonth() + 1);
      const d = pad2(v.getUTCDate());
      const hr = pad2(v.getUTCHours());
      const mn = pad2(v.getUTCMinutes());
      const sc = pad2(v.getUTCSeconds());
      const ms = String(v.getUTCMilliseconds()).padStart(3, '0');
      return `${y}-${m}-${d} ${hr}:${mn}:${sc}.${ms}`;
    }
    return String(v);
  };
  const firstObs = toLocalString(h.first_observed || h.last_observed || h.date || h.created_at) || new Date().toISOString();
  const lastObs = toLocalString(h.last_observed || h.first_observed) || firstObs;

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
    incident_type: rawIncType,
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
    description: h.description || '',
    mitre: mitreTechnique,
    mitre_id: mitreId,
    mitre_tactic: mitreTactic,
    mitre_technique: mitreTechnique,
    ruleId: String(h.rule_id || h.ruleId || ''),
    rule_id: String(h.rule_id || h.ruleId || ''),
    sourceIp: h.ip_source || h.sourceIp || '',
    agent_ip: h.agent_ip || '',
    ip_source: h.ip_source || h.sourceIp || '',
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
function formatDateReadable(val: any): string {
  if (!val) return 'N/A';
  try {
    const d = parseCustomDate(val);
    if (!d || isNaN(d.getTime())) return String(val);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dateStr} ${timeStr}`;
  } catch {
    return String(val);
  }
}

function parseRawVulnerability(h: any, fallbackId: string): Vulnerability {
  const cve = h.cve || h.cveId || '';
  const pkgName = h.package_name || h.package || '';
  const vulnTitle = h.title || h.vulnerability || h.name || pkgName || cve || 'CVE Vulnerability';
  const detectDate = h.detected_at || h.detectionDate || h.last_seen || h.first_seen || h.created_at || new Date().toISOString();
  const rawAgent = h.host || h.agent || h.agent_name || (h.agent_id ? `Agent ${h.agent_id}` : '');
  const agentName = String(rawAgent).replace(/-agent$/i, '').trim();
  const pkgVersion = h.version || h.currentVersion || h.package_version || 'N/A';

  const baseId = h._id ? String(h._id) : (h.id ? String(h.id) : (cve ? `${cve}_${agentName}_${pkgName}` : fallbackId));

  let sev = String(h.severity || 'Medium');
  sev = sev.charAt(0).toUpperCase() + sev.slice(1).toLowerCase();

  const isSolved =
    String(h.status).toLowerCase() === 'solved' ||
    String(h.status).toLowerCase() === 'pass' ||
    String(h.status).toLowerCase() === 'patched';

  return {
    id: baseId,
    _id: baseId,
    name: vulnTitle,
    vulnerability: vulnTitle,
    severity: sev as any,
    agent: agentName || 'Unknown Agent',
    cveId: cve || 'N/A',
    cve: cve || 'N/A',
    detectionDate: formatDateReadable(detectDate),
    detected_at: (detectDate instanceof Date ? (() => {
      const pad2 = (n: number) => String(n).padStart(2, '0');
      const y = detectDate.getUTCFullYear();
      const m = pad2(detectDate.getUTCMonth() + 1);
      const d = pad2(detectDate.getUTCDate());
      const hr = pad2(detectDate.getUTCHours());
      const mn = pad2(detectDate.getUTCMinutes());
      const sc = pad2(detectDate.getUTCSeconds());
      const ms = String(detectDate.getUTCMilliseconds()).padStart(3, '0');
      return `${y}-${m}-${d} ${hr}:${mn}:${sc}.${ms}`;
    })() : String(detectDate)),
    status: (isSolved ? 'Solved' : 'Not Patched') as any,
    currentVersion: pkgVersion,
    version: pkgVersion,
    description: h.description || h.title || `Vulnerability ${cve} detected on ${pkgName || 'package'}`,
    impact: h.impact || '',
    category: h.category || 'Packages',
    classification: h.category || 'Packages',
    package: pkgName || vulnTitle || '',
    ip: h.ip || h.agent_ip || 'N/A',
  };
}

/**
 * Menentukan tanggal-tanggal target spesifik untuk query Redis In-Memory Cache
 */
function getTargetDatesForRange(
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null
): string[] {
  const lower = (timeRange || 'today').toLowerCase().trim();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const formatDateOnly = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (lower === 'today') {
    return [formatDateOnly(now)];
  }

  if (lower === 'yesterday') {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return [formatDateOnly(y)];
  }

  if (lower === 'this week' || lower === '7d') {
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    const dates: string[] = [];
    const cur = new Date(monday);
    while (cur <= now) {
      dates.push(formatDateOnly(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  if (lower === 'last week') {
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 3600 * 1000);
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(lastMonday.getTime() + i * 24 * 3600 * 1000);
      dates.push(formatDateOnly(d));
    }
    return dates;
  }

  if (lower.startsWith('custom') || (startDate && endDate)) {
    let sStr = startDate;
    let eStr = endDate;
    if (lower.includes(':')) {
      const parts = timeRange?.split(':')[1]?.split('_');
      if (parts && parts.length === 2) {
        sStr = parts[0];
        eStr = parts[1];
      }
    }
    if (sStr && eStr) {
      const start = new Date(`${sStr}T00:00:00.000`);
      const end = new Date(`${eStr}T23:59:59.999`);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const dates: string[] = [];
        const cur = new Date(start);
        while (cur <= end) {
          dates.push(formatDateOnly(cur));
          cur.setDate(cur.getDate() + 1);
        }
        return dates;
      }
    }
  }

  return [];
}

/**
 * Mengambil data insiden dari Redis Cache (<cleanPrefix>:incident:*)
 */
async function fetchIncidentsFromRedis(
  databaseName: string,
  redisPrefix: string,
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<Incident[]> {
  try {
    const cleanPrefix = (redisPrefix || databaseName).replace(/:+$/, '');
    const redis = await getActiveRedisClient();
    if (redis) {
      const targetDates = getTargetDatesForRange(timeRange, startDate, endDate);
      let keys: string[] = [];
      if (targetDates && targetDates.length > 0) {
        keys = targetDates.map((d) => `${cleanPrefix}:incident:${d}`);
      } else {
        keys = await redis.keys(`${cleanPrefix}:incident:*`);
      }

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
    console.warn('[DataService] Redis incident query error:', redisErr.message);
  }
  return [];
}

function buildMongoDateFilter(
  dateField: string,
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null
): Record<string, any> {
  const lower = (timeRange || '').toLowerCase().trim();
  const now = new Date();

  const makeRange = (start: Date, end?: Date) => {
    const dateCond: any = { $gte: start };
    const strIsoCond: any = { $gte: start.toISOString() };
    if (end) {
      dateCond.$lte = end;
      strIsoCond.$lte = end.toISOString();
    }
    return {
      $or: [
        { [dateField]: dateCond },
        { [dateField]: strIsoCond }
      ]
    };
  };

  if (lower.startsWith('custom') || (startDate && endDate)) {
    let sStr = startDate;
    let eStr = endDate;
    if (lower.includes(':')) {
      const parts = timeRange?.split(':')[1]?.split('_');
      if (parts && parts.length === 2) {
        sStr = parts[0];
        eStr = parts[1];
      }
    }
    if (sStr && eStr) {
      const start = new Date(`${sStr}T00:00:00.000`);
      const end = new Date(`${eStr}T23:59:59.999`);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return makeRange(start, end);
      }
    }
    return {};
  }

  if (lower === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return makeRange(startOfToday, endOfToday);
  }

  if (lower === 'this week' || lower === '7d') {
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const mondayThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0);
    return makeRange(mondayThisWeek);
  }

  if (lower === 'this month' || lower === '30d') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    return makeRange(startOfMonth);
  }

  return {};
}

function buildMongoIncidentFilter(
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null
): Record<string, any> {
  const lower = (timeRange || '').toLowerCase().trim();
  const now = new Date();

  const pad = (n: number) => String(n).padStart(2, '0');
  const formatDateOnly = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const formatDateTime = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  if (lower.startsWith('custom') || (startDate && endDate)) {
    let sStr = startDate;
    let eStr = endDate;
    if (lower.includes(':')) {
      const parts = timeRange?.split(':')[1]?.split('_');
      if (parts && parts.length === 2) {
        sStr = parts[0];
        eStr = parts[1];
      }
    }
    if (sStr && eStr) {
      const start = new Date(`${sStr}T00:00:00.000`);
      const end = new Date(`${eStr}T23:59:59.999`);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const sDateStr = formatDateOnly(start);
        const eDateStr = formatDateOnly(end);
        return { date: { $gte: sDateStr, $lte: eDateStr } };
      }
    }
    return {};
  }

  if (lower === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayDateStr = formatDateOnly(startOfToday);
    return { date: todayDateStr };
  }

  if (lower === 'this week' || lower === '7d') {
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const mondayThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0);
    const mondayDateStr = formatDateOnly(mondayThisWeek);
    return { date: { $gte: mondayDateStr } };
  }

  if (lower === 'this month' || lower === '30d') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const startMonthDateStr = formatDateOnly(startOfMonth);
    return { date: { $gte: startMonthDateStr } };
  }

  return {};
}

/**
 * Mengambil data insiden dari MongoDB Master dengan filter rentang waktu
 */
async function fetchIncidentsFromMongo(
  databaseName: string,
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<Incident[]> {
  try {
    const col = await getIncidentsCollection(databaseName);
    const filter = buildMongoIncidentFilter(timeRange, startDate, endDate);
    const docs = await col
      .find(filter)
      .sort({ first_observed: -1, date: -1, last_observed: -1, _id: -1 })
      .toArray();

    if (docs && docs.length > 0) {
      return docs.map((doc: any, idx: number) => parseRawIncident(doc, `mongo-inc-${idx + 1}`));
    }
  } catch (mongoErr: any) {
    console.warn('[DataService] MongoDB incident query error:', mongoErr.message);
  }
  return [];
}

export interface TenantIncidentsResult {
  incidents: Incident[];
  source: 'redis' | 'mongodb';
}

/**
 * Mengambil data insiden tenant dengan deteksi sumber (Redis Hot Cache vs MongoDB Master):
 * - Rentang 1-7 Hari (Today, This Week, 7d, Yesterday, Last Week, Custom <= 7d): Prioritas ke Redis Cache (< 2ms).
 * - Rentang > 7 Hari atau jika Redis kosong/error: Fallback otomatis ke MongoDB Master.
 */
export async function getTenantIncidentsWithSource(
  databaseName: string,
  redisPrefix: string,
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<TenantIncidentsResult> {
  const isRecent = isQueryForRecentDays(timeRange, startDate, endDate);
  if (isRecent) {
    try {
      const redisIncidents = await fetchIncidentsFromRedis(databaseName, redisPrefix, timeRange, startDate, endDate);
      if (redisIncidents && redisIncidents.length > 0) {
        return { incidents: redisIncidents, source: 'redis' };
      }
    } catch (err: any) {
      console.warn('[DataService] Redis incident fetch failed, falling back to Mongo:', err.message);
    }
  }

  const mongoIncidents = await fetchIncidentsFromMongo(databaseName, timeRange, startDate, endDate);
  return { incidents: mongoIncidents, source: 'mongodb' };
}

/**
 * Mengambil data insiden tenant (backward-compatible):
 * - Rentang 1-7 Hari: Prioritas Redis Hot Cache.
 * - Rentang > 7 Hari / Fallback: MongoDB Master.
 */
export async function getTenantIncidents(
  databaseName: string,
  redisPrefix: string,
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<Incident[]> {
  const res = await getTenantIncidentsWithSource(databaseName, redisPrefix, timeRange, startDate, endDate);
  return res.incidents;
}

export interface DashboardIncidentAggregatedResult {
  stats: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
    score: number;
  };
  topIncidents: any[];
  source: 'redis' | 'mongodb';
}

/**
 * Agregasi super cepat untuk Dashboard Incidents:
 * - Jika data ada di Redis (Today/This Week): hitung langsung dari in-memory cache.
 * - Jika di MongoDB (This Month/30d/All): gunakan MongoDB $facet aggregation server-side
 *   sehingga tidak perlu me-load puluhan ribu dokumen ke RAM Node.js.
 */
export async function queryDashboardIncidentStats(
  databaseName: string,
  redisPrefix: string,
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null,
  registeredAgentKeys: string[] = [],
  tenantCampusName: string = ''
): Promise<DashboardIncidentAggregatedResult> {
  const isRecent = isQueryForRecentDays(timeRange, startDate, endDate);
  if (isRecent) {
    try {
      const redisIncidents = await fetchIncidentsFromRedis(databaseName, redisPrefix, timeRange, startDate, endDate);
      if (redisIncidents && redisIncidents.length > 0) {
        const validIncidents = redisIncidents.filter((inc) => {
          const idStr = String(inc.agent_id || inc.agent || inc.host || '').trim();
          const hostStr = String(inc.host || '').trim().toLowerCase();
          const agentStr = String(inc.agent || '').trim().toLowerCase();
          const isAgent000 = idStr === '000' || idStr === '0' || Number(idStr) === 0;
          const isHealthChecker = hostStr === 'health-checker' || agentStr === 'health-checker' || hostStr === '000';
          const isCampusWeb = hostStr.includes('srv-web.campus.ac.id') || agentStr.includes('srv-web.campus.ac.id');
          return !isAgent000 && !isHealthChecker && !isCampusWeb;
        });

        let critical = 0;
        let high = 0;
        let medium = 0;
        let low = 0;
        const agentSeverityMap: Record<string, { critical: number; high: number; medium: number }> = {};

        validIncidents.forEach((inc) => {
          const sev = parseSeverity(inc.severity).toLowerCase();
          if (sev === 'critical') critical++;
          else if (sev === 'high') high++;
          else if (sev === 'medium') medium++;
          else low++;

          const canonicalKey = String(inc.host || inc.agent || inc.agent_id || '').trim().toLowerCase();
          if (canonicalKey) {
            if (!agentSeverityMap[canonicalKey]) {
              agentSeverityMap[canonicalKey] = { critical: 0, high: 0, medium: 0 };
            }
            if (sev === 'critical') agentSeverityMap[canonicalKey].critical++;
            else if (sev === 'high') agentSeverityMap[canonicalKey].high++;
            else if (sev === 'medium') agentSeverityMap[canonicalKey].medium++;
          }
        });

        const targetAgents = registeredAgentKeys.length > 0
          ? registeredAgentKeys
          : Object.keys(agentSeverityMap);
        const totalAgentsCount = Math.max(1, targetAgents.length);
        let sumAgentScores = 0;
        targetAgents.forEach((agentKey) => {
          const st = agentSeverityMap[agentKey] || { critical: 0, high: 0, medium: 0 };
          sumAgentScores += Math.min(100, st.critical * 6 + st.high * 3 + st.medium * 1);
        });
        const score = Math.round((sumAgentScores / totalAgentsCount) * 10) / 10;

        const groupedList = groupAlertsToIncidents(validIncidents, tenantCampusName);
        const topIncidents = groupedList.slice(0, 30).map((inc, index) => {
          const ts = getTimestamp(inc.lastObserved || inc.firstObserved || inc.date);
          return {
            id: String(inc.id || inc._id || `top-inc-${index + 1}_${ts}`),
            incidentName: inc.incidentName,
            incident_type: inc.incident_type,
            severity: inc.severity,
            agent: inc.agent,
            agentsList: [inc.agent],
            host: inc.host || inc.agent,
            count: inc.count || 1,
            firstObserved: inc.firstObserved,
            lastObserved: inc.lastObserved,
            rawDate: ts,
            ruleId: inc.ruleId || 'N/A',
            tenant: tenantCampusName,
          };
        });

        return {
          stats: { critical, high, medium, low, total: critical + high + medium + low, score },
          topIncidents,
          source: 'redis',
        };
      }
    } catch (err: any) {
      console.warn('[DashboardStats] Redis incident aggregation failed, fallback to Mongo:', err.message);
    }
  }

  // MongoDB Server-Side Fast Aggregation
  try {
    const col = await getIncidentsCollection(databaseName);
    const baseFilter = buildMongoIncidentFilter(timeRange, startDate, endDate);
    const matchFilter: Record<string, any> = {
      ...baseFilter,
      agent_id: { $nin: ['000', '0', 0] },
      host: { $not: /srv-web\.campus\.ac\.id/i },
    };

    const facetRes = await col.aggregate([
      { $match: matchFilter },
      {
        $facet: {
          severityCounts: [
            {
              $group: {
                _id: '$severity',
                count: { $sum: 1 },
              },
            },
          ],
          agentCounts: [
            {
              $group: {
                _id: {
                  agent: { $ifNull: ['$host', '$agent'] },
                  severity: '$severity',
                },
                count: { $sum: 1 },
              },
            },
          ],
          topIncidentsCritical: [
            {
              $match: {
                $or: [
                  { severity: { $gte: 15 } },
                  { severity: { $in: ['Critical', 'critical', 'CRITICAL'] } },
                ],
              },
            },
            {
              $group: {
                _id: {
                  rule_id: '$rule_id',
                  agent: { $ifNull: ['$host', '$agent'] },
                  ip_source: { $ifNull: ['$ip_source', ''] },
                  date: '$date',
                },
                firstDoc: { $first: '$$ROOT' },
                count: { $sum: 1 },
                firstObserved: { $min: '$first_observed' },
                lastObserved: { $max: '$first_observed' },
              },
            },
            { $sort: { lastObserved: -1 } },
            { $limit: 10 },
          ],
          topIncidentsHigh: [
            {
              $match: {
                $or: [
                  { severity: { $gte: 12, $lte: 14 } },
                  { severity: { $in: ['High', 'high', 'HIGH'] } },
                ],
              },
            },
            {
              $group: {
                _id: {
                  rule_id: '$rule_id',
                  agent: { $ifNull: ['$host', '$agent'] },
                  ip_source: { $ifNull: ['$ip_source', ''] },
                  date: '$date',
                },
                firstDoc: { $first: '$$ROOT' },
                count: { $sum: 1 },
                firstObserved: { $min: '$first_observed' },
                lastObserved: { $max: '$first_observed' },
              },
            },
            { $sort: { lastObserved: -1 } },
            { $limit: 10 },
          ],
          topIncidentsMedium: [
            {
              $match: {
                $or: [
                  { severity: { $gte: 7, $lte: 11 } },
                  { severity: { $in: ['Medium', 'medium', 'MEDIUM'] } },
                ],
              },
            },
            {
              $group: {
                _id: {
                  rule_id: '$rule_id',
                  agent: { $ifNull: ['$host', '$agent'] },
                  ip_source: { $ifNull: ['$ip_source', ''] },
                  date: '$date',
                },
                firstDoc: { $first: '$$ROOT' },
                count: { $sum: 1 },
                firstObserved: { $min: '$first_observed' },
                lastObserved: { $max: '$first_observed' },
              },
            },
            { $sort: { lastObserved: -1 } },
            { $limit: 10 },
          ],
        },
      },
    ]).toArray();

    const facet = facetRes[0] || {};
    const severityCounts = facet.severityCounts || [];
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    for (const item of severityCounts) {
      const sev = parseSeverity(item._id).toLowerCase();
      const count = Number(item.count) || 0;
      if (sev === 'critical') critical += count;
      else if (sev === 'high') high += count;
      else if (sev === 'medium') medium += count;
      else low += count;
    }

    const agentCounts = facet.agentCounts || [];
    const agentSeverityMap: Record<string, { critical: number; high: number; medium: number }> = {};
    for (const item of agentCounts) {
      const rawAgent = item._id?.agent;
      const canonicalKey = String(rawAgent || '').trim().toLowerCase();
      if (!canonicalKey) continue;
      if (!agentSeverityMap[canonicalKey]) {
        agentSeverityMap[canonicalKey] = { critical: 0, high: 0, medium: 0 };
      }
      const sev = parseSeverity(item._id?.severity).toLowerCase();
      const count = Number(item.count) || 0;
      if (sev === 'critical') agentSeverityMap[canonicalKey].critical += count;
      else if (sev === 'high') agentSeverityMap[canonicalKey].high += count;
      else if (sev === 'medium') agentSeverityMap[canonicalKey].medium += count;
    }

    const targetAgents = registeredAgentKeys.length > 0
      ? registeredAgentKeys
      : Object.keys(agentSeverityMap);
    const totalAgentsCount = Math.max(1, targetAgents.length);
    let sumAgentScores = 0;
    targetAgents.forEach((agentKey) => {
      const st = agentSeverityMap[agentKey] || { critical: 0, high: 0, medium: 0 };
      sumAgentScores += Math.min(100, st.critical * 6 + st.high * 3 + st.medium * 1);
    });
    const score = Math.round((sumAgentScores / totalAgentsCount) * 10) / 10;

    const rawTopList = [
      ...(facet.topIncidentsCritical || []),
      ...(facet.topIncidentsHigh || []),
      ...(facet.topIncidentsMedium || []),
    ];

    const topIncidents = rawTopList.map((item: any, idx: number) => {
      const doc = item.firstDoc || {};
      const agentName = item._id?.agent || doc.host || doc.agent || 'Agent';
      const ruleId = item._id?.rule_id || doc.rule_id || '';
      const ipSource = item._id?.ip_source || doc.ip_source || '';
      const lastObs = item.lastObserved || doc.last_observed || doc.first_observed || '';
      const firstObs = item.firstObserved || doc.first_observed || lastObs;
      const ts = getTimestamp(lastObs || item._id?.date);
      const rawType = doc.incident_type;
      const incType = Array.isArray(rawType) ? rawType.join(', ') : (rawType || 'Unknown');
      const incName = doc.description || (ruleId ? `Rule ${ruleId}` : 'Security Incident');
      return {
        id: String(doc._id || `top-inc-${idx + 1}_${ts}`),
        incidentName: incName,
        incident_type: incType,
        severity: parseSeverity(doc.severity),
        agent: agentName,
        agentsList: [agentName],
        host: doc.host || agentName,
        count: item.count || 1,
        firstObserved: firstObs,
        lastObserved: lastObs,
        rawDate: ts,
        ruleId: String(ruleId || 'N/A'),
        sourceIp: ipSource,
        ip_source: ipSource,
        tenant: tenantCampusName,
      };
    });

    return {
      stats: { critical, high, medium, low, total: critical + high + medium + low, score },
      topIncidents,
      source: 'mongodb',
    };
  } catch (err: any) {
    console.error('[DashboardStats] Mongo aggregation error:', err);
    return {
      stats: { critical: 0, high: 0, medium: 0, low: 0, total: 0, score: 0 },
      topIncidents: [],
      source: 'mongodb',
    };
  }
}

/**
 * Server-side Aggregation untuk Device Risk Scores:
 * - Menghitung skor risiko dan sebaran severity per agen langsung di MongoDB / Redis Hot Cache
 *   tanpa menarik puluhan ribu dokumen mentah ke memori server.
 */
export async function queryDeviceRiskScores(
  databaseName: string,
  redisPrefix: string,
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<Record<string, {
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  score: number;
  riskCategory: string;
  detectedIssues: string[];
}>> {
  const isRecent = isQueryForRecentDays(timeRange, startDate, endDate);
  if (isRecent) {
    try {
      const redisIncidents = await fetchIncidentsFromRedis(databaseName, redisPrefix, timeRange, startDate, endDate);
      if (redisIncidents && redisIncidents.length > 0) {
        const validIncidents = redisIncidents.filter((inc) => {
          const idStr = String(inc.agent_id || inc.agent || inc.host || '').trim();
          const hostStr = String(inc.host || '').trim().toLowerCase();
          const agentStr = String(inc.agent || '').trim().toLowerCase();
          const isAgent000 = idStr === '000' || idStr === '0' || Number(idStr) === 0;
          const isHealthChecker = hostStr === 'health-checker' || agentStr === 'health-checker' || hostStr === '000';
          const isCampusWeb = hostStr.includes('srv-web.campus.ac.id') || agentStr.includes('srv-web.campus.ac.id');
          return !isAgent000 && !isHealthChecker && !isCampusWeb;
        });

        const tempMap = new Map<string, { critical: number; high: number; medium: number; low: number; issues: Set<string> }>();
        validIncidents.forEach((inc) => {
          const agentIdKey = String(inc.agent_id || inc.agent || inc.host || '').trim().toLowerCase();
          const hostKey = String(inc.host || inc.agent || '').trim().toLowerCase();
          const nameKey = String(inc.agent || inc.host || '').trim().toLowerCase();
          const ipKey = String(inc.agent_ip || '').trim().toLowerCase();

          const sev = parseSeverity(inc.severity).toLowerCase();
          const count = 1;
          const issueText = String(inc.description || inc.incident_type || inc.incidentName || '');

          const keysToUpdate = Array.from(new Set([agentIdKey, hostKey, nameKey, ipKey])).filter(Boolean);
          keysToUpdate.forEach((key) => {
            if (!tempMap.has(key)) {
              tempMap.set(key, { critical: 0, high: 0, medium: 0, low: 0, issues: new Set<string>() });
            }
            const stat = tempMap.get(key)!;
            if (sev === 'critical') stat.critical += count;
            else if (sev === 'high') stat.high += count;
            else if (sev === 'medium') stat.medium += count;
            else stat.low += count;
            if (issueText && stat.issues.size < 5) {
              stat.issues.add(issueText);
            }
          });
        });

        const scoresMap: Record<string, any> = {};
        tempMap.forEach((stats, key) => {
          const rawScore = stats.critical * 6 + stats.high * 3 + stats.medium * 1;
          const score = Math.min(100, rawScore);
          const cat = getRiskCategory(score);
          scoresMap[key] = {
            criticalCount: stats.critical,
            highCount: stats.high,
            mediumCount: stats.medium,
            lowCount: stats.low,
            score,
            riskCategory: cat.label,
            detectedIssues: Array.from(stats.issues),
          };
        });
        return scoresMap;
      }
    } catch {
      // fallback to Mongo
    }
  }

  // MongoDB Server-Side Fast Aggregation
  try {
    const col = await getIncidentsCollection(databaseName);
    const baseFilter = buildMongoIncidentFilter(timeRange, startDate, endDate);
    const matchFilter: Record<string, any> = {
      ...baseFilter,
      agent_id: { $nin: ['000', '0', 0] },
      host: { $not: /srv-web\.campus\.ac\.id/i },
    };

    const grouped = await col.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            agent_id: '$agent_id',
            host: { $ifNull: ['$host', '$agent'] },
            ip: { $ifNull: ['$agent_ip', ''] },
            severity: '$severity',
          },
          count: { $sum: 1 },
          sampleDesc: { $first: { $ifNull: ['$description', '$incident_type'] } },
        },
      },
    ]).toArray();

    const tempMap = new Map<string, { critical: number; high: number; medium: number; low: number; issues: Set<string> }>();

    for (const item of grouped) {
      const g = item._id || {};
      const agentIdKey = String(g.agent_id || '').trim().toLowerCase();
      const hostKey = String(g.host || '').trim().toLowerCase();
      const ipKey = String(g.ip || '').trim().toLowerCase();

      const sev = parseSeverity(g.severity).toLowerCase();
      const count = Number(item.count) || 1;
      const issueText = Array.isArray(item.sampleDesc) ? item.sampleDesc.join(', ') : String(item.sampleDesc || '');

      const keysToUpdate = Array.from(new Set([agentIdKey, hostKey, ipKey])).filter(Boolean);
      keysToUpdate.forEach((key) => {
        if (!tempMap.has(key)) {
          tempMap.set(key, { critical: 0, high: 0, medium: 0, low: 0, issues: new Set<string>() });
        }
        const stat = tempMap.get(key)!;
        if (sev === 'critical') stat.critical += count;
        else if (sev === 'high') stat.high += count;
        else if (sev === 'medium') stat.medium += count;
        else stat.low += count;
        if (issueText && stat.issues.size < 5) {
          stat.issues.add(issueText);
        }
      });
    }

    const scoresMap: Record<string, any> = {};
    tempMap.forEach((stats, key) => {
      const rawScore = stats.critical * 6 + stats.high * 3 + stats.medium * 1;
      const score = Math.min(100, rawScore);
      const cat = getRiskCategory(score);
      scoresMap[key] = {
        criticalCount: stats.critical,
        highCount: stats.high,
        mediumCount: stats.medium,
        lowCount: stats.low,
        score,
        riskCategory: cat.label,
        detectedIssues: Array.from(stats.issues),
      };
    });

    return scoresMap;
  } catch (err: any) {
    console.error('[queryDeviceRiskScores] Error:', err);
    return {};
  }
}

export interface ServerSideIncidentsQuery {
  page?: number;
  limit?: number;
  search?: string;
  severity?: string;
  incidentType?: string;
  agent?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  timeRange?: string;
  startDate?: string | null;
  endDate?: string | null;
  groupBy?: 'alerts' | 'incidents';
  tenantName?: string;
}

export interface ServerSideIncidentsResult {
  data: Incident[];
  total: number;
  totalAlerts: number;
  page: number;
  limit: number;
  totalPages: number;
  dataSource: {
    incidents: 'redis' | 'mongodb';
    historicalStats: string;
  };
  groupBy: 'alerts' | 'incidents';
  incidents: {
    critical: number;
    criticalPrev: number;
    criticalDelta: number;
    high: number;
    highPrev: number;
    highDelta: number;
    medium: number;
    mediumPrev: number;
    mediumDelta: number;
    low: number;
    lowPrev: number;
    lowDelta: number;
    total: number;
    totalPrev: number;
    totalDelta: number;
    periodLabel: string;
  };
  filterOptions?: {
    agents: string[];
    incidentNames: string[];
    severities: string[];
  };
}

/**
 * High-Performance Server-Side Aggregation and Pagination for Incidents (Wazuh / OpenSearch style).
 * - Rentang 1-7 Hari: Prioritas ke Redis Hot-Cache dengan memory pagination & grouping.
 * - Rentang > 7 Hari (This Month, 30d, etc.): Pipeline $facet MongoDB dengan projection tanpa log mentah berat (< 150ms).
 * - Lazy Loading: Kolom full_logs tidak dimuat di tabel list, hanya diambil on-demand saat View Full Log dibuka.
 */
export async function queryServerSideIncidents(
  databaseName: string,
  redisPrefix: string,
  options: ServerSideIncidentsQuery
): Promise<ServerSideIncidentsResult> {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 10));
  const skip = (page - 1) * limit;
  const groupBy = options.groupBy === 'incidents' ? 'incidents' : 'alerts';
  const tenantName = options.tenantName || databaseName;
  const timeRange = options.timeRange || 'Today';
  const startDate = options.startDate;
  const endDate = options.endDate;

  const isRecent = isQueryForRecentDays(timeRange, startDate, endDate);

  // 1. Prioritas ke Redis Hot Cache untuk rentang 1-7 hari
  if (isRecent) {
    try {
      const rawDocs = await fetchIncidentsFromRedis(databaseName, redisPrefix, timeRange, startDate, endDate);
      if (rawDocs && rawDocs.length > 0) {
        // Filter out agent 000 / health-checker
        const validDocs = rawDocs.filter((doc: any) => {
          const idStr = String(doc.agent_id || doc.agent || doc.host || '').trim();
          const hostStr = String(doc.host || '').trim().toLowerCase();
          const agentStr = String(doc.agent || '').trim().toLowerCase();

          const isAgent000 = idStr === '000' || idStr === '0' || Number(idStr) === 0;
          const isHealthChecker = hostStr === 'health-checker' || agentStr === 'health-checker' || hostStr === '000';
          const isCampusWeb = hostStr.includes('srv-web.campus.ac.id') || agentStr.includes('srv-web.campus.ac.id');

          return !isAgent000 && !isHealthChecker && !isCampusWeb;
        });

        let filtered = validDocs;

        if (options.incidentType && options.incidentType !== 'All') {
          const typeRegex = new RegExp(options.incidentType, 'i');
          filtered = filtered.filter((d: any) => {
            const incType = Array.isArray(d.incidentName || d.incident_type) ? (d.incidentName || d.incident_type).join(', ') : String(d.incidentName || d.incident_type || '');
            const desc = String(d.description || '');
            return typeRegex.test(incType) || typeRegex.test(desc);
          });
        }

        if (options.agent && options.agent !== 'All') {
          const agentRegex = new RegExp(options.agent, 'i');
          filtered = filtered.filter((d: any) => {
            const h = String(d.host || d.agent || '');
            return agentRegex.test(h);
          });
        }

        // Calculate severity breakdown on raw alerts
        let critical = 0;
        let high = 0;
        let medium = 0;
        let low = 0;

        filtered.forEach((doc: any) => {
          const s = parseSeverity(doc.severity).toLowerCase();
          if (s === 'critical') critical++;
          else if (s === 'high') high++;
          else if (s === 'medium') medium++;
          else low++;
        });
        const totalAlerts = filtered.length;

        // Group or map with includeFullLogs = false (lazy loading!)
        let mapped = groupBy === 'incidents'
          ? groupAlertsToIncidents(filtered, tenantName, false)
          : filtered.map((doc: any, index: number) => mapAlertToItem(doc, index, tenantName, false));

        if (options.severity && options.severity !== 'All') {
          mapped = mapped.filter((item) => item.severity.toLowerCase() === options.severity?.toLowerCase());
        }

        if (options.search && options.search.trim()) {
          const q = options.search.toLowerCase().trim();
          mapped = mapped.filter(
            (item) =>
              item.incidentName.toLowerCase().includes(q) ||
              item.agent.toLowerCase().includes(q) ||
              item.description.toLowerCase().includes(q) ||
              item.mitre.toLowerCase().includes(q) ||
              (item.sourceIp && item.sourceIp.toLowerCase().includes(q))
          );
        }

        // Sort
        const sortDirection = options.sortOrder === 'asc' ? 1 : -1;
        mapped.sort((a: any, b: any) => {
          if (options.sortBy === 'count') {
            return ((a.count || 1) - (b.count || 1)) * sortDirection;
          }
          if (options.sortBy === 'severity') {
            const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
            const sA = order[String(a.severity).toLowerCase()] || 0;
            const sB = order[String(b.severity).toLowerCase()] || 0;
            return (sA - sB) * sortDirection;
          }
          if (options.sortBy === 'agent') {
            return a.agent.localeCompare(b.agent) * sortDirection;
          }
          if (options.sortBy === 'incidentName' || options.sortBy === 'name') {
            return a.incidentName.localeCompare(b.incidentName) * sortDirection;
          }
          if (options.sortBy === 'lastObserved' && groupBy === 'incidents') {
            const tA = getTimestamp(a.lastObserved || a.firstObserved || a.date);
            const tB = getTimestamp(b.lastObserved || b.firstObserved || b.date);
            return (tA - tB) * sortDirection;
          }
          const tA = getTimestamp(a.firstObserved || a.lastObserved || a.date);
          const tB = getTimestamp(b.firstObserved || b.lastObserved || b.date);
          return (tA - tB) * sortDirection;
        });

        const total = mapped.length;
        const totalPages = Math.ceil(total / limit) || 1;
        const paginatedDocs = mapped.slice(skip, skip + limit);

        // Historical comparison
        const histComp = await getHistoricalComparisonStats(databaseName, timeRange, startDate, endDate, redisPrefix);
        const criticalPrev = histComp.criticalPrev ?? 0;
        const highPrev = histComp.highPrev ?? 0;
        const mediumPrev = histComp.mediumPrev ?? 0;
        const lowPrev = histComp.lowPrev ?? 0;
        const totalPrev = histComp.totalPrev ?? 0;

        return {
          data: paginatedDocs,
          total,
          totalAlerts,
          page,
          limit,
          totalPages,
          groupBy,
          dataSource: {
            incidents: 'redis',
            historicalStats: histComp.source || 'redis',
          },
          incidents: {
            critical,
            criticalPrev,
            criticalDelta: critical - criticalPrev,
            high,
            highPrev,
            highDelta: high - highPrev,
            medium,
            mediumPrev,
            mediumDelta: medium - mediumPrev,
            low,
            lowPrev,
            lowDelta: low - lowPrev,
            total: totalAlerts,
            totalPrev,
            totalDelta: totalAlerts - totalPrev,
            periodLabel: histComp.periodLabel || 'PREVIOUS PERIOD',
          },
          filterOptions: {
            agents: Array.from(new Set(validDocs.map((d: any) => d.host || d.agent).filter(Boolean))).sort(),
            incidentNames: Array.from(new Set(validDocs.map((d: any) => {
              if (Array.isArray(d.incident_type) && d.incident_type.length > 0) return d.incident_type[0];
              return d.incident_type || d.incidentName || d.description;
            }).filter(Boolean))).sort(),
            severities: ['Critical', 'High', 'Medium', 'Low'],
          },
        };
      }
    } catch (redisErr: any) {
      console.warn('[DataService] Redis server-side incident query notice:', redisErr.message);
    }
  }

  // 2. High-performance MongoDB $facet Aggregation for > 7 days or Fallback
  try {
    const col = await getIncidentsCollection(databaseName);
    const baseDateFilter = buildMongoIncidentFilter(timeRange, startDate, endDate);

    const matchConditions: any[] = [
      {
        agent_id: { $nin: ['000', '0', 0] },
        host: { $nin: ['health-checker', '000', /srv-web\.campus\.ac\.id/i] }
      }
    ];

    if (Object.keys(baseDateFilter).length > 0) {
      matchConditions.push(baseDateFilter);
    }

    if (options.severity && options.severity !== 'All') {
      const sLower = options.severity.trim().toLowerCase();
      if (sLower === 'critical') {
        matchConditions.push({
          $or: [
            { severity: { $regex: /^critical$/i } },
            { severity: { $gte: 15 } }
          ]
        });
      } else if (sLower === 'high') {
        matchConditions.push({
          $or: [
            { severity: { $regex: /^high$/i } },
            { severity: { $gte: 12, $lte: 14 } }
          ]
        });
      } else if (sLower === 'medium') {
        matchConditions.push({
          $or: [
            { severity: { $regex: /^medium$/i } },
            { severity: { $gte: 7, $lte: 11 } }
          ]
        });
      } else if (sLower === 'low') {
        matchConditions.push({
          $or: [
            { severity: { $regex: /^low$/i } },
            { severity: { $gte: 1, $lte: 6 } }
          ]
        });
      } else {
        matchConditions.push({ severity: { $regex: new RegExp(`^${options.severity}$`, 'i') } });
      }
    }

    if (options.agent && options.agent !== 'All') {
      const aRegex = new RegExp(options.agent, 'i');
      matchConditions.push({
        $or: [{ host: aRegex }, { agent: aRegex }, { agent_id: aRegex }]
      });
    }

    if (options.incidentType && options.incidentType !== 'All') {
      const tRegex = new RegExp(options.incidentType, 'i');
      matchConditions.push({
        $or: [{ incident_type: tRegex }, { description: tRegex }]
      });
    }

    if (options.search && options.search.trim()) {
      const q = options.search.trim();
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sRegex = new RegExp(escaped, 'i');
      matchConditions.push({
        $or: [
          { description: sRegex },
          { incident_type: sRegex },
          { host: sRegex },
          { agent: sRegex },
          { agent_id: sRegex },
          { agent_ip: sRegex },
          { ip_source: sRegex },
          { sourceIp: sRegex },
          { rule_id: sRegex }
        ]
      });
    }

    const searchAndFilter = matchConditions.length === 1 ? matchConditions[0] : { $and: matchConditions };

    const sortDirection: 1 | -1 = options.sortOrder === 'asc' ? 1 : -1;

    let facetPipeline: Record<string, any> = {};

    if (groupBy === 'incidents') {
      let groupSortStage: Record<string, 1 | -1> = { last_observed: -1 };
      if (options.sortBy === 'count') {
        groupSortStage = { count: sortDirection, last_observed: -1 };
      } else if (options.sortBy === 'severity') {
        groupSortStage = { severity: sortDirection, last_observed: -1 };
      } else if (options.sortBy === 'agent') {
        groupSortStage = { host: sortDirection, last_observed: -1 };
      } else if (options.sortBy === 'firstObserved') {
        groupSortStage = { first_observed: sortDirection };
      } else if (options.sortBy === 'lastObserved') {
        groupSortStage = { last_observed: sortDirection };
      }

      facetPipeline = {
        severityStats: [
          { $group: { _id: '$severity', count: { $sum: 1 } } }
        ],
        totalAlerts: [
          { $count: 'count' }
        ],
        uniqueAgents: [
          { $match: { host: { $exists: true, $ne: '' } } },
          { $group: { _id: '$host' } },
          { $limit: 100 }
        ],
        uniqueIncidentNames: [
          { $match: { incident_type: { $exists: true, $ne: '' } } },
          { $group: { _id: '$incident_type' } },
          { $limit: 100 }
        ],
        groupedCount: [
          {
            $group: {
              _id: { rule_id: '$rule_id', agent: '$host', ip: '$ip_source', date: '$date' }
            }
          },
          { $count: 'count' }
        ],
        paginatedRows: [
          {
            $group: {
              _id: { rule_id: '$rule_id', agent: '$host', ip: '$ip_source', date: '$date' },
              count: { $sum: 1 },
              sample_id: { $first: '$_id' },
              first_observed: { $min: '$first_observed' },
              last_observed: { $max: '$first_observed' },
              severity: { $first: '$severity' },
              incident_type: { $first: '$incident_type' },
              description: { $first: '$description' },
              rule_id: { $first: '$rule_id' },
              host: { $first: '$host' },
              agent_id: { $first: '$agent_id' },
              agent_ip: { $first: '$agent_ip' },
              ip_source: { $first: '$ip_source' },
              ip_destination: { $first: '$ip_destination' },
              affected_file: { $first: '$affected_file' },
              mitre_id: { $first: '$mitre_id' },
              mitre_tactic: { $first: '$mitre_tactic' },
              mitre_technique: { $first: '$mitre_technique' }
            }
          },
          { $sort: groupSortStage },
          { $skip: skip },
          { $limit: limit }
        ]
      };
    } else {
      let alertSortStage: Record<string, 1 | -1> = { first_observed: -1, _id: -1 };
      if (options.sortBy === 'severity') {
        alertSortStage = { severity: sortDirection, first_observed: -1 };
      } else if (options.sortBy === 'agent') {
        alertSortStage = { host: sortDirection, first_observed: -1 };
      } else if (options.sortBy === 'firstObserved') {
        alertSortStage = { first_observed: sortDirection, _id: -1 };
      }

      facetPipeline = {
        severityStats: [
          { $group: { _id: '$severity', count: { $sum: 1 } } }
        ],
        totalAlerts: [
          { $count: 'count' }
        ],
        uniqueAgents: [
          { $match: { host: { $exists: true, $ne: '' } } },
          { $group: { _id: '$host' } },
          { $limit: 100 }
        ],
        uniqueIncidentNames: [
          { $match: { description: { $exists: true, $ne: '' } } },
          { $group: { _id: '$description' } },
          { $limit: 100 }
        ],
        paginatedRows: [
          { $sort: alertSortStage },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              full_logs: 0,
              full_log: 0,
              raw_log: 0,
              log: 0
            }
          }
        ]
      };
    }

    const [facetRes] = await col.aggregate([
      { $match: searchAndFilter },
      { $facet: facetPipeline }
    ]).toArray();

    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    for (const s of facetRes.severityStats || []) {
      const parsed = parseSeverity(s._id).toLowerCase();
      if (parsed === 'critical') critical += s.count;
      else if (parsed === 'high') high += s.count;
      else if (parsed === 'medium') medium += s.count;
      else if (parsed === 'low') low += s.count;
    }

    const totalAlerts = facetRes.totalAlerts?.[0]?.count || 0;
    const total = groupBy === 'incidents'
      ? (facetRes.groupedCount?.[0]?.count || 0)
      : totalAlerts;
    const totalPages = Math.ceil(total / limit) || 1;

    let mappedData: Incident[] = [];

    if (groupBy === 'incidents') {
      mappedData = (facetRes.paginatedRows || []).map((row: any) => {
        const gKey = row._id || {};
        const ruleId = String(row.rule_id || gKey.rule_id || '');
        const agentName = row.host || gKey.agent || (row.agent_id ? `Agent ${row.agent_id}` : 'Agent');
        const rawIncType = formatIncidentType(row.incident_type);
        const incName = rawIncType || (ruleId ? `Rule ${ruleId}` : 'Security Event');
        const rawFirst = row.first_observed || row.date;
        const rawLast = row.last_observed || rawFirst;
        const uniqueId = `inc_grp_${ruleId}:::${row.agent_id || agentName}:::${row.ip_source || gKey.ip || ''}:::${row.date || gKey.date || ''}`.replace(/[:\/ ]+/g, '_');

        const sampleId = String(row.sample_id || uniqueId);

        return {
          id: uniqueId,
          _id: uniqueId,
          sample_id: sampleId,
          incidentName: incName,
          incident_type: rawIncType,
          severity: parseSeverity(row.severity),
          agent: agentName,
          host: agentName,
          agent_id: row.agent_id ? String(row.agent_id) : undefined,
          ruleId,
          rule_id: ruleId,
          firstObserved: formatStandardDate(rawFirst),
          lastObserved: formatStandardDate(rawLast),
          count: row.count || 1,
          description: row.description || '',
          mitre: row.mitre_id || row.mitre_technique || '',
          mitre_id: row.mitre_id || '',
          mitre_tactic: row.mitre_tactic || '',
          mitre_technique: row.mitre_technique || '',
          sourceIp: row.ip_source || row.sourceIp || '',
          agent_ip: row.agent_ip || '',
          ip_source: row.ip_source || row.sourceIp || '',
          destIp: row.ip_destination || '',
          ip_destination: row.ip_destination || '',
          affected_file: row.affected_file || '',
          university: tenantName,
          tenant: tenantName,
          full_logs: '', // LAZY LOADED: Loaded on-demand when "View Full Log" is clicked
        };
      });
    } else {
      mappedData = (facetRes.paginatedRows || []).map((doc: any, index: number) => {
        const item = mapAlertToItem(doc, skip + index, tenantName, false);
        return item;
      });
    }

    const histComp = await getHistoricalComparisonStats(databaseName, timeRange, startDate, endDate, redisPrefix);
    const criticalPrev = histComp.criticalPrev ?? 0;
    const highPrev = histComp.highPrev ?? 0;
    const mediumPrev = histComp.mediumPrev ?? 0;
    const lowPrev = histComp.lowPrev ?? 0;
    const totalPrev = histComp.totalPrev ?? 0;

    return {
      data: mappedData,
      total,
      totalAlerts,
      page,
      limit,
      totalPages,
      groupBy,
      dataSource: {
        incidents: 'mongodb',
        historicalStats: histComp.source || 'mongodb',
      },
      incidents: {
        critical,
        criticalPrev,
        criticalDelta: critical - criticalPrev,
        high,
        highPrev,
        highDelta: high - highPrev,
        medium,
        mediumPrev,
        mediumDelta: medium - mediumPrev,
        low,
        lowPrev,
        lowDelta: low - lowPrev,
        total: totalAlerts,
        totalPrev,
        totalDelta: totalAlerts - totalPrev,
        periodLabel: histComp.periodLabel || 'PREVIOUS PERIOD',
      },
      filterOptions: {
        agents: (facetRes.uniqueAgents || []).map((a: any) => String(a._id || '')).filter(Boolean).sort(),
        incidentNames: (facetRes.uniqueIncidentNames || []).map((i: any) => {
          const val = i._id;
          if (Array.isArray(val)) return val[0] || '';
          return String(val || '');
        }).filter(Boolean).sort(),
        severities: ['Critical', 'High', 'Medium', 'Low'],
      },
    };
  } catch (mongoErr: any) {
    console.error('[queryServerSideIncidents] MongoDB error:', mongoErr);
    throw mongoErr;
  }
}

export interface VulnerabilitiesResult {
  data: Vulnerability[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Mengambil data kerentanan (vulnerability) tenant menggunakan server-side aggregation.
 */
export async function getTenantVulnerabilities(
  databaseName: string,
  redisPrefix: string,
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null,
  offset = 0,
  limit = 1000
): Promise<VulnerabilitiesResult> {
  const page = Math.floor(offset / limit) + 1;
  const res = await queryServerSideVulnerabilities(databaseName, redisPrefix, {
    timeRange,
    startDate,
    endDate,
    page,
    limit,
  });
  return {
    data: res.data,
    total: res.total,
    offset,
    limit,
    hasMore: offset + res.data.length < res.total,
  };
}

export interface ServerSideVulnerabilitiesQuery {
  page?: number;
  limit?: number;
  search?: string;
  severity?: string;
  status?: string;
  agent?: string;
  category?: string;
  vulnerability?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  timeRange?: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface ServerSideVulnerabilitiesResult {
  data: Vulnerability[];
  total: number;
  filteredTotal: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    solved: number;
  };
  distribution: Array<{
    label: string;
    value: number;
    color: string;
    fullLabel: string;
  }>;
  filterOptions: {
    agents: string[];
    categories: string[];
    vulnerabilities: string[];
  };
}

/**
 * Server-Side Aggregation and Pagination for Vulnerabilities (Wazuh / OpenSearch style).
 * Executes a high-speed $facet pipeline in MongoDB:
 * - Calculates overall stats for Donut Chart (Critical, High, Medium, Solved) in ~20-50ms
 * - Computes top vulnerability distribution for secondary widget
 * - Filters by search regex, severity, status, and agent in database engine
 * - Returns exact paginated rows (e.g. 10 rows) with small payload (< 5 KB)
 */
export async function queryServerSideVulnerabilities(
  databaseName: string,
  redisPrefix: string,
  options: ServerSideVulnerabilitiesQuery
): Promise<ServerSideVulnerabilitiesResult> {
  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 10));
  const skip = (page - 1) * limit;

  try {
    const col = await getVulnerabilitiesCollection(databaseName);

    // 1. Base date filter based on active time range
    const baseDateFilter = buildMongoDateFilter('detected_at', options.timeRange, options.startDate, options.endDate);

    // 2. Build search & facet filter
    const searchAndFilter: Record<string, any> = { ...baseDateFilter };

    if (options.severity && options.severity !== 'All') {
      searchAndFilter.severity = { $regex: new RegExp(`^${options.severity}$`, 'i') };
    }

    if (options.status && options.status !== 'All') {
      const isSolved = options.status.toLowerCase() === 'solved' || options.status.toLowerCase() === 'patched';
      if (isSolved) {
        searchAndFilter.status = { $in: [/solved/i, /patched/i, /pass/i] };
      } else {
        searchAndFilter.status = { $nin: [/solved/i, /patched/i, /pass/i] };
      }
    }

    if (options.agent && options.agent !== 'All') {
      searchAndFilter.agent = { $regex: new RegExp(`^${options.agent}$`, 'i') };
    }

    if (options.category && options.category !== 'All') {
      searchAndFilter.category = { $regex: new RegExp(`^${options.category}$`, 'i') };
    }

    if (options.vulnerability && options.vulnerability !== 'All') {
      searchAndFilter.vulnerability = { $regex: new RegExp(`^${options.vulnerability}$`, 'i') };
    }

    if (options.search && options.search.trim()) {
      const q = options.search.trim();
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const sRegex = new RegExp(escaped, 'i');
      searchAndFilter.$or = [
        { cve: sRegex },
        { vulnerability: sRegex },
        { agent: sRegex },
        { ip: sRegex },
        { description: sRegex },
        { category: sRegex },
      ];
    }

    // 3. Determine sorting criteria
    let sortStage: Record<string, 1 | -1> = { detected_at: -1, _id: -1 };
    const direction: 1 | -1 = options.sortOrder === 'asc' ? 1 : -1;

    if (options.sortBy === 'severity') {
      sortStage = { severity: direction, detected_at: -1 };
    } else if (options.sortBy === 'name' || options.sortBy === 'vulnerability') {
      sortStage = { vulnerability: direction, detected_at: -1 };
    } else if (options.sortBy === 'agent') {
      sortStage = { agent: direction, detected_at: -1 };
    } else if (options.sortBy === 'cveId' || options.sortBy === 'cve') {
      sortStage = { cve: direction, detected_at: -1 };
    } else if (options.sortBy === 'detectionDate' || options.sortBy === 'detected_at') {
      sortStage = { detected_at: direction, _id: -1 };
    }

    // 4. Execute single $facet aggregation pipeline
    const [facetRes] = await col.aggregate([
      {
        $facet: {
          severityStats: [
            { $match: baseDateFilter },
            { $group: { _id: '$severity', count: { $sum: 1 } } },
          ],
          statusStats: [
            { $match: baseDateFilter },
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          uniqueAgents: [
            { $match: baseDateFilter },
            { $group: { _id: '$agent' } },
            { $sort: { _id: 1 } },
            { $limit: 100 },
          ],
          uniqueCategories: [
            { $match: baseDateFilter },
            { $group: { _id: '$category' } },
            { $sort: { _id: 1 } },
            { $limit: 50 },
          ],
          uniqueVulnerabilities: [
            { $match: baseDateFilter },
            { $group: { _id: '$vulnerability' } },
            { $sort: { _id: 1 } },
            { $limit: 50 },
          ],
          topVulnerabilities: [
            { $match: searchAndFilter },
            { $group: { _id: '$vulnerability', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 4 },
          ],
          filteredCount: [
            { $match: searchAndFilter },
            { $count: 'count' },
          ],
          paginatedDocs: [
            { $match: searchAndFilter },
            { $sort: sortStage },
            { $skip: skip },
            { $limit: limit },
          ],
        },
      },
    ]).toArray();

    // 5. Extract statistics
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let totalSeverityCount = 0;

    for (const s of facetRes.severityStats || []) {
      const k = String(s._id || '').toLowerCase();
      totalSeverityCount += s.count;
      if (k === 'critical') critical = s.count;
      else if (k === 'high') high = s.count;
      else if (k === 'medium') medium = s.count;
      else if (k === 'low') low = s.count;
    }

    let solved = 0;
    for (const st of facetRes.statusStats || []) {
      const k = String(st._id || '').toLowerCase();
      if (k === 'solved' || k === 'patched' || k === 'pass') {
        solved += st.count;
      }
    }

    const filteredTotal = facetRes.filteredCount?.[0]?.count || 0;
    const totalPages = Math.ceil(filteredTotal / limit) || 1;
    const docs = facetRes.paginatedDocs || [];

    const agents = (facetRes.uniqueAgents || []).map((a: any) => a._id).filter(Boolean);
    const categories = (facetRes.uniqueCategories || []).map((c: any) => c._id).filter(Boolean);
    const vulnerabilities = (facetRes.uniqueVulnerabilities || []).map((v: any) => v._id).filter(Boolean);

    // Build distribution segments for UI Donut widget
    const distColors = ['#B8251B', '#EA580C', '#5B9BD5', '#8B5CF6', '#9CA3AF'];
    const distribution = (facetRes.topVulnerabilities || []).map((tv: any, idx: number) => {
      const rawName = String(tv._id || 'Unknown').trim();
      const cleanName = rawName.split(' ')[0].replace(/[^a-zA-Z0-9_-]/g, '');
      const label = cleanName.length > 12 ? cleanName.substring(0, 11) + '…' : cleanName || 'Other';
      return {
        label,
        value: tv.count,
        color: distColors[idx % distColors.length],
        fullLabel: rawName,
      };
    });
    const distSum = distribution.reduce((sum: number, item: any) => sum + item.value, 0);
    const otherCount = Math.max(0, filteredTotal - distSum);
    if (otherCount > 0 && distribution.length > 0) {
      distribution.push({
        label: 'Other',
        value: otherCount,
        color: '#9CA3AF',
        fullLabel: 'Other Vulnerabilities',
      });
    }

    const data = docs.map((doc: any, idx: number) =>
      parseRawVulnerability(doc, `server-vuln-${skip + idx + 1}`)
    );

    return {
      data,
      total: totalSeverityCount || filteredTotal,
      filteredTotal,
      page,
      limit,
      totalPages,
      stats: {
        total: totalSeverityCount || filteredTotal,
        critical,
        high,
        medium,
        low,
        solved,
      },
      distribution,
      filterOptions: {
        agents,
        categories,
        vulnerabilities,
      },
    };
  } catch (err: any) {
    console.error('[DataService] Server-side vulnerability query error:', err.message);
    return {
      data: [],
      total: 0,
      filteredTotal: 0,
      page,
      limit,
      totalPages: 1,
      stats: { total: 0, critical: 0, high: 0, medium: 0, low: 0, solved: 0 },
      distribution: [],
      filterOptions: { agents: [], categories: [], vulnerabilities: [] },
    };
  }
}


export async function getTenantReports(databaseName: string): Promise<SecurityReport[]> {
  try {
    const col = await getReportsCollection(databaseName);
    const docs = await col.find({}).sort({ date_generated: -1, last_updated: -1 }).toArray();

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const toLocalString = (v: any) => {
      if (!v) return '';
      if (v instanceof Date) {
        if (isNaN(v.getTime())) return '';
        const y = v.getUTCFullYear();
        const m = pad2(v.getUTCMonth() + 1);
        const d = pad2(v.getUTCDate());
        const hr = pad2(v.getUTCHours());
        const mn = pad2(v.getUTCMinutes());
        const sc = pad2(v.getUTCSeconds());
        return `${y}-${m}-${d} ${hr}:${mn}:${sc}`;
      }
      return String(v);
    };
    return docs.map((doc: any) => ({
      id: String(doc._id || doc.id || doc.report_uuid || Math.random()),
      reportName: doc.report_name || doc.reportName || 'Security Incident Analysis',
      report_name: doc.report_name || doc.reportName || 'Security Incident Analysis',
      report_id: doc.report_id || 1,
      report_uuid: doc.report_uuid || String(doc._id || ''),
      soc_id: doc.soc_id || '',
      type: doc.type || 'Automated Incident Response',
      dateGenerated: toLocalString(doc.date_generated || doc.dateGenerated) || new Date().toISOString(),
      date_generated: toLocalString(doc.date_generated || doc.dateGenerated) || new Date().toISOString(),
      severity: (doc.severity || 'Medium') as any,
      lastUpdated: toLocalString(doc.last_updated || doc.lastUpdated || doc.date_generated),
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
 * Mengambil ringkasan KPI mingguan langsung dari Redis (<cleanPrefix>:historical_statistics:weekly)
 */
export async function getWeeklyHistoricalKpiFromRedis(redisPrefix: string): Promise<any | null> {
  try {
    const cleanPrefix = (redisPrefix || '').replace(/:+$/, '');
    if (!cleanPrefix) return null;
    const redis = await getActiveRedisClient();
    if (redis) {
      const data = await redis.get(`${cleanPrefix}:historical_statistics:weekly`);
      if (data) {
        return JSON.parse(data);
      }
    }
  } catch (err: any) {
    console.warn('[DataService] Error reading weekly KPI from Redis:', err.message);
  }
  return null;
}

/**
 * Mengambil statistik perbandingan historis dari Redis Cache atau koleksi `historical_statistics` di MongoDB
 */
export async function getHistoricalComparisonStats(
  databaseName: string,
  timeFilter = 'Today',
  startDate?: string | null,
  endDate?: string | null,
  redisPrefix?: string
): Promise<{
  criticalPrev: number;
  highPrev: number;
  mediumPrev: number;
  lowPrev: number;
  totalPrev: number;
  riskPrev: number;
  periodLabel: string;
  found: boolean;
  source?: 'redis' | 'mongodb';
}> {
  const cleanPrefix = (redisPrefix || databaseName).replace(/:+$/, '');
  const lower = (timeFilter || 'today').toLowerCase();

  // 1. Coba Hot Cache Redis terlebih dahulu untuk Today & This Week
  if (cleanPrefix) {
    try {
      const redis = await getActiveRedisClient();
      if (redis) {
        if (lower === 'this week' || lower === '7d') {
          const weeklyStr = await redis.get(`${cleanPrefix}:historical_statistics:weekly`);
          if (weeklyStr) {
            const weekly = JSON.parse(weeklyStr);
            if (weekly && typeof weekly === 'object') {
              return {
                criticalPrev: weekly.critical_prev || 0,
                highPrev: weekly.high_prev || 0,
                mediumPrev: weekly.medium_prev || 0,
                lowPrev: weekly.low_prev || 0,
                totalPrev: weekly.total_prev || 0,
                riskPrev: weekly.risk_score_prev || 0,
                periodLabel: weekly.period_label || 'LAST WEEK',
                found: true,
                source: 'redis',
              };
            }
          }
        } else if (lower === 'today') {
          const now = new Date();
          const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          const yStr = formatDateKey(yesterday);
          const yData = await redis.get(`${cleanPrefix}:historical_statistics:${yStr}`);
          if (yData) {
            const parsed = JSON.parse(yData);
            if (parsed && typeof parsed === 'object') {
              const crit = parsed.critical || 0;
              const high = parsed.high || 0;
              const med = parsed.medium || 0;
              const low = parsed.low || 0;
              const tot = parsed.totalSeverity !== undefined ? parsed.totalSeverity : (crit + high + med + low);
              const rScore = parsed.riskScore || 0;
              return {
                criticalPrev: crit,
                highPrev: high,
                mediumPrev: med,
                lowPrev: low,
                totalPrev: tot,
                riskPrev: rScore,
                periodLabel: 'YESTERDAY',
                found: true,
                source: 'redis',
              };
            }
          }
        }
      }
    } catch (redisErr: any) {
      console.warn('[DataService] Redis historical stats query warning:', redisErr.message);
    }
  }

  try {
    const col = await getHistoricalStatisticsCollection(databaseName);
    const now = new Date();
    const lower = (timeFilter || 'today').toLowerCase();

    let startOfPrev: string;
    let endOfPrev: string;
    let periodLabel = 'YESTERDAY';

    let sStr = startDate;
    let eStr = endDate;
    if (lower.startsWith('custom') && lower.includes(':')) {
      const parts = timeFilter.split(':')[1]?.split('_');
      if (parts && parts.length === 2) {
        sStr = parts[0];
        eStr = parts[1];
      }
    }

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
    } else if (sStr && eStr) {
      const s = new Date(sStr);
      const e = new Date(eStr);
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
