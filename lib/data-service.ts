import { getActiveRedisClient } from '@/lib/redis';
import { getDb, getIncidentsCollection, getVulnerabilitiesCollection, getReportsCollection, getHistoricalStatisticsCollection } from '@/lib/db';
import { Incident, Vulnerability, SecurityReport, Device } from '@/lib/types';
import { parseCustomDate } from '@/lib/date-utils';

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

  const firstObs = h.first_observed || h.last_observed || h.date || h.created_at || new Date().toISOString();
  const lastObs = h.last_observed || h.first_observed || firstObs;

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
    detected_at: String(detectDate),
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
 * Mengambil data insiden dari Redis Cache (<cleanPrefix>:incident:*)
 */
async function fetchIncidentsFromRedis(databaseName: string, redisPrefix: string): Promise<Incident[]> {
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

  const pad = (n: number) => String(n).padStart(2, '0');
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
        return {
          [dateField]: {
            $gte: formatDateTime(start),
            $lte: formatDateTime(end),
          },
        };
      }
    }
    return {};
  }

  if (lower === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    return {
      [dateField]: { $gte: formatDateTime(startOfToday) },
    };
  }

  if (lower === 'this week' || lower === '7d') {
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const mondayThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0);
    return {
      [dateField]: { $gte: formatDateTime(mondayThisWeek) },
    };
  }

  if (lower === 'this month' || lower === '30d') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    return {
      [dateField]: { $gte: formatDateTime(startOfMonth) },
    };
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
    const filter = buildMongoDateFilter('last_observed', timeRange, startDate, endDate);
    const docs = await col
      .find(filter)
      .sort({ last_observed: -1, first_observed: -1, _id: -1 })
      .limit(1000)
      .toArray();

    if (docs && docs.length > 0) {
      return docs.map((doc: any, idx: number) => parseRawIncident(doc, `mongo-inc-${idx + 1}`));
    }
  } catch (mongoErr: any) {
    console.warn('[DataService] MongoDB incident query error:', mongoErr.message);
  }
  return [];
}

/**
 * Mengambil data insiden tenant:
 * - Rentang 1-7 Hari (Today, This Week, 7d, default): Prioritas ke Redis In-Memory Cache (< 1ms).
 *   Jika Redis kosong/down, fallback ke MongoDB dengan filter 1-7 hari.
 * - Rentang > 7 Hari (This Month, 30d, All, Custom > 7h): HANYA query ke MongoDB Master (tanpa Redis).
 */
export async function getTenantIncidents(
  databaseName: string,
  redisPrefix: string,
  timeRange?: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<Incident[]> {
  const isRecent = isQueryForRecentDays(timeRange, startDate, endDate);

  // 1. Jika filter 1-7 hari, prioritas ke Redis Cache
  if (isRecent) {
    const redisData = await fetchIncidentsFromRedis(databaseName, redisPrefix);
    if (redisData.length > 0) {
      return redisData;
    }
    // Fallback ke MongoDB dengan filter tanggal jika Redis kosong/down
    return await fetchIncidentsFromMongo(databaseName, timeRange, startDate, endDate);
  }

  // 2. Jika filter > 7 hari, HANYA query langsung ke MongoDB Master
  return await fetchIncidentsFromMongo(databaseName, timeRange, startDate, endDate);
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
