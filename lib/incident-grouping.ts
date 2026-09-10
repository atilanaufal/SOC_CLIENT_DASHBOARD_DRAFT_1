import { parseSeverity } from '@/lib/severity';
import { getTimestamp, formatStandardDate, parseCustomDate } from '@/lib/date-utils';
import { Incident } from '@/lib/types';

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  informational: 0,
};

/**
 * Extracts a normalized date string (YYYY-MM-DD) from an alert document
 */
export function extractAlertDate(doc: any): string {
  let dateStr = String(doc.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  const rawDate = doc.first_observed || doc.firstObserved || doc.last_observed || doc.lastObserved || doc.created_at;
  if (rawDate) {
    const parsed = parseCustomDate(rawDate);
    if (parsed) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const rawStr = String(rawDate).trim();
    if (rawStr.includes('T')) return rawStr.split('T')[0];
    if (rawStr.includes(' ')) return rawStr.split(' ')[0];
  }

  return 'UnknownDate';
}

/**
 * Generates the grouping key based on (rule_id, agent_id, ip_source, date)
 */
export function getAlertGroupKey(doc: any): string {
  const ruleId = String(doc.rule_id || doc.ruleId || '').trim();
  const agentId = String(doc.agent_id || doc.agent || doc.host || '').trim();
  const ipSource = String(doc.ip_source || doc.sourceIp || doc.agent_ip || '').trim();
  const dateStr = extractAlertDate(doc);

  return `${ruleId}:::${agentId}:::${ipSource}:::${dateStr}`;
}

/**
 * Safely extracts or reconstructs full logs text for SIEM / inspection
 */
export function extractFullLogs(doc: any): string {
  if (typeof doc.full_logs === 'string' && doc.full_logs.trim()) {
    return doc.full_logs;
  }
  if (typeof doc.full_log === 'string' && doc.full_log.trim()) {
    return doc.full_log;
  }
  if (typeof doc.raw_log === 'string' && doc.raw_log.trim()) {
    return doc.raw_log;
  }
  if (typeof doc.log === 'string' && doc.log.trim()) {
    return doc.log;
  }
  if (Array.isArray(doc.full_logs)) {
    return doc.full_logs.join('\n');
  }
  if (doc.full_logs && typeof doc.full_logs === 'object') {
    return JSON.stringify(doc.full_logs, null, 2);
  }
  if (doc.data && typeof doc.data === 'object') {
    return JSON.stringify(doc.data, null, 2);
  }

  const rawFirst = doc.first_observed || doc.firstObserved || doc.date || new Date().toISOString();
  const rawObj = {
    timestamp: rawFirst,
    rule: {
      id: doc.rule_id || doc.ruleId || '',
      level: doc.severity === 'Critical' ? 12 : doc.severity === 'High' ? 10 : doc.severity === 'Medium' ? 7 : 4,
      description: doc.description || doc.incidentName || '',
    },
    agent: {
      id: doc.agent_id ? String(doc.agent_id) : (doc.agent || ''),
      name: doc.host || doc.agent || '',
      ip: doc.agent_ip || doc.sourceIp || doc.ip_source || '',
    },
    data: {
      srcip: doc.sourceIp || doc.ip_source || doc.agent_ip || '',
      dstip: doc.destIp || doc.ip_destination || '',
      count: doc.count || 1,
      affected_file: doc.affected_file || '',
    },
    full_log: `${rawFirst} ${doc.host || doc.agent || ''} ossec: Alert [${doc.rule_id || doc.ruleId || ''}] (${doc.severity || 'Medium'}): ${doc.description || doc.incidentName || ''}`,
  };

  return JSON.stringify(rawObj, null, 2);
}

export function formatIncidentType(val: any): string {
  if (!val) return '';
  if (Array.isArray(val)) {
    return val.filter(Boolean).join(', ');
  }
  return String(val).trim();
}

/**
 * Maps a single pure alert into Incident format (no count, no lastObserved)
 */
export function mapAlertToItem(doc: any, index: number, tenantName = '', includeFullLogs = true): Incident {
  const docSeverity = parseSeverity(doc.severity);
  const rawFirst = doc.first_observed || doc.firstObserved || doc.date || '';
  const uniqueId = String(doc.id || doc._id || `alert_${index + 1}_${rawFirst}`);

  const rawIncType = formatIncidentType(doc.incident_type);

  // Alert name uses field description as primary source, not incident_type
  const incName = doc.description || rawIncType || (doc.rule_id || doc.ruleId ? `Rule ${doc.rule_id || doc.ruleId}` : 'Security Event');

  return {
    id: uniqueId,
    _id: uniqueId,
    sample_id: String(doc._id || doc.id || uniqueId),
    incidentName: incName,
    incident_type: rawIncType,
    severity: docSeverity,
    agent: doc.host || doc.agent || (doc.agent_id ? `Agent ${doc.agent_id}` : ''),
    host: doc.host || doc.agent || '',
    agent_id: doc.agent_id ? String(doc.agent_id) : undefined,
    firstObserved: formatStandardDate(rawFirst),
    // Pure alert: NO count and NO lastObserved
    lastObserved: undefined,
    count: undefined,
    description: doc.description || '',
    mitre: doc.mitre || doc.mitre_technique || doc.mitre_id || '',
    mitre_id: doc.mitre_id || '',
    mitre_tactic: doc.mitre_tactic || '',
    mitre_technique: doc.mitre_technique || '',
    ruleId: String(doc.ruleId || doc.rule_id || ''),
    rule_id: String(doc.rule_id || doc.ruleId || ''),
    university: doc.university || tenantName,
    tenant: doc.tenant || tenantName,
    impact: Array.isArray(doc.impact) ? doc.impact : (doc.impact ? [doc.impact] : []),
    sourceIp: doc.sourceIp || doc.agent_ip || doc.ip_source || '',
    agent_ip: doc.agent_ip || doc.sourceIp || doc.ip_source || '',
    ip_source: doc.ip_source || doc.agent_ip || doc.sourceIp || '',
    destIp: doc.destIp || doc.ip_destination || '',
    ip_destination: doc.ip_destination || doc.destIp || '',
    affected_file: doc.affected_file || '',
    full_logs: includeFullLogs ? extractFullLogs(doc) : '',
  };
}

/**
 * Groups alerts by (rule_id, agent_id, ip_source, date) into aggregated incidents.
 * Each grouped incident includes count and lastObserved.
 */
export function groupAlertsToIncidents(docs: any[], tenantName = '', includeFullLogs = true): Incident[] {
  const groupsMap = new Map<string, any[]>();

  docs.forEach((doc) => {
    const key = getAlertGroupKey(doc);
    const existing = groupsMap.get(key);
    if (existing) {
      existing.push(doc);
    } else {
      groupsMap.set(key, [doc]);
    }
  });

  const groupedIncidents: Incident[] = [];

  groupsMap.forEach((alerts, groupKey) => {
    if (!alerts || alerts.length === 0) return;

    // Determine earliest and latest alert by timestamp
    let earliestAlert = alerts[0];
    let latestAlert = alerts[0];
    let minTimestamp = Infinity;
    let maxTimestamp = -Infinity;

    let maxWeight = -1;
    let highestSeverity = 'Medium';

    alerts.forEach((alert) => {
      const rawDate = alert.first_observed || alert.firstObserved || alert.last_observed || alert.lastObserved || alert.date || alert.created_at;
      const ts = getTimestamp(rawDate);

      if (ts < minTimestamp) {
        minTimestamp = ts;
        earliestAlert = alert;
      }
      if (ts > maxTimestamp) {
        maxTimestamp = ts;
        latestAlert = alert;
      }

      const parsedSev = parseSeverity(alert.severity);
      const weight = SEVERITY_WEIGHTS[parsedSev.toLowerCase()] ?? 2;
      if (weight > maxWeight) {
        maxWeight = weight;
        highestSeverity = parsedSev;
      }
    });

    const representativeAlert = latestAlert;
    const ruleId = String(representativeAlert.rule_id || representativeAlert.ruleId || '');
    const agentName = representativeAlert.host || representativeAlert.agent || (representativeAlert.agent_id ? `Agent ${representativeAlert.agent_id}` : 'Agent');
    const agentId = representativeAlert.agent_id ? String(representativeAlert.agent_id) : '';
    const dateStr = extractAlertDate(representativeAlert);

    const rawIncType = formatIncidentType(representativeAlert.incident_type);

    // Grouped incidents use incident_type as primary source for Incident Name (not description!)
    const incName = rawIncType || (ruleId ? `Rule ${ruleId}` : 'Security Event');

    const rawFirstDate = earliestAlert.first_observed || earliestAlert.firstObserved || earliestAlert.date || earliestAlert.created_at;
    const rawLastDate = latestAlert.first_observed || latestAlert.firstObserved || latestAlert.last_observed || latestAlert.lastObserved || latestAlert.date || latestAlert.created_at;

    const fullLogsCombined = alerts
      .slice(-5) // Take up to 5 latest logs
      .map((a) => extractFullLogs(a))
      .filter(Boolean)
      .join('\n\n--- NEXT EVENT IN INCIDENT GROUP ---\n\n');

    const groupId = `inc_grp_${groupKey.replace(/[:\/ ]+/g, '_')}`;

    groupedIncidents.push({
      id: groupId,
      _id: groupId,
      sample_id: String(representativeAlert._id || representativeAlert.id || groupId),
      incidentName: incName,
      incident_type: rawIncType,
      severity: highestSeverity,
      agent: agentName,
      host: representativeAlert.host || representativeAlert.agent || '',
      agent_id: agentId,
      ruleId: ruleId,
      rule_id: ruleId,
      firstObserved: formatStandardDate(rawFirstDate),
      lastObserved: formatStandardDate(rawLastDate),
      date: dateStr,
      count: alerts.length,
      description: representativeAlert.description || '',
      mitre: representativeAlert.mitre || representativeAlert.mitre_technique || representativeAlert.mitre_id || '',
      mitre_id: representativeAlert.mitre_id || '',
      mitre_tactic: representativeAlert.mitre_tactic || '',
      mitre_technique: representativeAlert.mitre_technique || '',
      sourceIp: representativeAlert.sourceIp || representativeAlert.ip_source || representativeAlert.agent_ip || '',
      ip_source: representativeAlert.ip_source || representativeAlert.sourceIp || representativeAlert.agent_ip || '',
      agent_ip: representativeAlert.agent_ip || representativeAlert.sourceIp || representativeAlert.ip_source || '',
      destIp: representativeAlert.destIp || representativeAlert.ip_destination || '',
      ip_destination: representativeAlert.ip_destination || representativeAlert.destIp || '',
      affected_file: representativeAlert.affected_file || '',
      university: representativeAlert.university || tenantName,
      tenant: representativeAlert.tenant || tenantName,
      full_logs: includeFullLogs ? (fullLogsCombined || extractFullLogs(representativeAlert)) : '',
    });
  });

  return groupedIncidents;
}
