import { NextResponse } from 'next/server';
import { parseSeverity } from '@/lib/severity';

import { getTenantIncidents } from '@/lib/data-service';
import { getTenantContext } from '@/lib/tenant-context';
import { getTimestamp } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

function formatDate(val: any): string {
  if (!val) return 'N/A';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dateStr} ${timeStr}`;
  } catch {
    return String(val);
  }
}

function matchesTimeRange(doc: any, range: string, startDateParam?: string | null, endDateParam?: string | null): boolean {
  if (!range || range.toLowerCase() === 'all') return true;

  const rawDate = doc.last_observed || doc.lastObserved || doc.first_observed || doc.firstObserved || doc.date || doc.created_at;
  if (!rawDate) return true;

  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return true;

  const now = new Date();
  const lower = range.toLowerCase();

  if (lower.startsWith('custom') || (startDateParam && endDateParam)) {
    let sStr = startDateParam;
    let eStr = endDateParam;
    if (lower.includes(':')) {
      const parts = range.split(':')[1]?.split('_');
      if (parts && parts.length === 2) {
        sStr = parts[0];
        eStr = parts[1];
      }
    }
    if (sStr && eStr) {
      const start = new Date(`${sStr}T00:00:00.000`);
      const end = new Date(`${eStr}T23:59:59.999`);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        return d >= start && d <= end;
      }
    }
    return true;
  }

  if (lower === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return d >= startOfToday;
  }

  if (lower === 'this week' || lower === '7d') {
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const mondayThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
    return d >= mondayThisWeek;
  }

  if (lower === 'this month' || lower === '30d') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return d >= startOfMonth;
  }

  return true;
}

function extractFullLogs(doc: any): string {
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
  if (doc.full_logs && typeof doc.full_logs === 'object') {
    return JSON.stringify(doc.full_logs, null, 2);
  }
  if (doc.data && typeof doc.data === 'object') {
    return JSON.stringify(doc.data, null, 2);
  }


  const mitreIds = doc.mitre_id ? [doc.mitre_id] : (doc.mitre ? [doc.mitre] : []);
  const tactics = Array.isArray(doc.mitre_tactic) ? doc.mitre_tactic : (doc.mitre_tactic ? [doc.mitre_tactic] : []);
  const techniques = Array.isArray(doc.mitre_technique) ? doc.mitre_technique : (doc.mitre_technique ? [doc.mitre_technique] : []);

  const rawLogObj: Record<string, any> = {
    timestamp: doc.firstObserved || doc.lastObserved || new Date().toISOString(),
    rule: {
      id: doc.ruleId || doc.rule_id || '',
      level: doc.severity === 'Critical' ? 12 : doc.severity === 'High' ? 10 : doc.severity === 'Medium' ? 7 : 4,
      description: doc.description || doc.incidentName || '',
      mitre: {
        id: mitreIds,
        tactic: tactics,
        technique: techniques,
      },
    },
    agent: {
      id: doc.agent_id ? String(doc.agent_id) : (doc.agent || ''),
      name: doc.host || doc.agent || '',
      ip: doc.agent_ip || doc.sourceIp || '',

    },
    manager: {
      name: 'wazuh.manager',
    },

    location: doc.affected_file || doc.location || '',
    data: {
      srcip: doc.sourceIp || doc.agent_ip || '',
      dstip: doc.destIp || doc.ip_destination || '',
      count: doc.count || 1,
      affected_file: doc.affected_file || '',
      incident_type: doc.incidentName || '',
    },
    full_log: `${doc.firstObserved || new Date().toISOString()} ${doc.host || doc.agent || ''} ossec: Alert [${doc.ruleId || doc.rule_id || ''}] (${doc.severity || 'Medium'}): ${doc.description || doc.incidentName || ''}`,

  };

  return JSON.stringify(rawLogObj, null, 2);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const severity = searchParams.get('severity') || '';
    const incidentType = searchParams.get('incidentType') || '';
    const agent = searchParams.get('agent') || '';
    const timeRange = searchParams.get('timeRange') || searchParams.get('timeFilter') || '';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');


    // Authenticated Tenant Context
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi tidak valid atau telah berakhir.' },
        { status: 401 }
      );

    }

    // Query incidents directly for tenant (1-7 days from Redis, > 7 days from MongoDB)
    const rawDocs = await getTenantIncidents(tenant.databaseName, tenant.redisPrefix, timeRange, startDate, endDate);
    
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

    let docs = validDocs;

    if (incidentType && incidentType !== 'All') {
      const typeRegex = new RegExp(incidentType, 'i');
      docs = docs.filter((d: any) => {
        const incType = Array.isArray(d.incidentName || d.incident_type) ? (d.incidentName || d.incident_type).join(', ') : String(d.incidentName || d.incident_type || '');
        const desc = String(d.description || '');
        return typeRegex.test(incType) || typeRegex.test(desc);
      });
    }

    if (agent && agent !== 'All') {
      const agentRegex = new RegExp(agent, 'i');
      docs = docs.filter((d: any) => {
        const h = String(d.host || d.agent || '');
        return agentRegex.test(h);
      });
    }

    if (timeRange && timeRange !== 'All') {
      docs = docs.filter((d: any) => matchesTimeRange(d, timeRange, startDate, endDate));
    }

    let mapped = docs.map((doc: any, index: number) => {
      const docSeverity = parseSeverity(doc.severity);
      const rawFirst = doc.firstObserved || doc.first_observed || doc.date || "";
      const rawLast = doc.lastObserved || doc.last_observed || rawFirst;

      const fullLogString = extractFullLogs(doc);
      const uniqueId = String(doc.id || doc._id || `inc_${index + 1}_${rawFirst}`);

      return {

        id: uniqueId,
        _id: uniqueId,
        incidentName: doc.incidentName || doc.incident_type || doc.description || 'Security Event',
        severity: docSeverity,
        agent: doc.host || doc.agent || '',
        host: doc.host || doc.agent || '',
        firstObserved: formatDate(rawFirst),
        lastObserved: formatDate(rawLast),
        description: doc.description || doc.incidentName || '',
        mitre: doc.mitre || doc.mitre_technique || doc.mitre_id || '',
        mitre_id: doc.mitre_id || '',
        mitre_tactic: doc.mitre_tactic || '',
        mitre_technique: doc.mitre_technique || '',
        ruleId: String(doc.ruleId || doc.rule_id || ''),
        rule_id: String(doc.rule_id || doc.ruleId || ''),
        university: tenant.campusName,
        tenant: tenant.campusName,
        impact: Array.isArray(doc.impact) ? doc.impact : (doc.impact ? [doc.impact] : []),
        recommendedActions: Array.isArray(doc.recommendedActions)
          ? doc.recommendedActions
          : (doc.recommended_action ? [doc.recommended_action] : []),
        sourceIp: doc.sourceIp || doc.agent_ip || doc.ip_source || '',
        agent_ip: doc.agent_ip || doc.sourceIp || doc.ip_source || '',
        ip_source: doc.ip_source || doc.agent_ip || doc.sourceIp || '',
        destIp: doc.destIp || doc.ip_destination || '',
        ip_destination: doc.ip_destination || doc.destIp || '',
        affected_file: doc.affected_file || '',
        count: Number(doc.count) || 1,
        timeObserved: formatDate(rawLast),
        full_logs: fullLogString,

      };
    });

    if (severity && severity !== 'All') {
      mapped = mapped.filter((item) => item.severity.toLowerCase() === severity.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      mapped = mapped.filter(
        (item) =>
          item.incidentName.toLowerCase().includes(q) ||
          item.agent.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.mitre.toLowerCase().includes(q) ||
          (item.sourceIp && item.sourceIp.toLowerCase().includes(q))
      );
    }

    // Ensure strict chronological sort (newest first)
    mapped.sort((a: any, b: any) => {
      const tA = getTimestamp(a.firstObserved || a.lastObserved || a.date);
      const tB = getTimestamp(b.firstObserved || b.lastObserved || b.date);
      return tB - tA;
    });

    return NextResponse.json({
      success: true,
      tenant: tenant.campusName,
      database: tenant.databaseName,
      data: mapped,
      total: mapped.length,
    });
  } catch (error: any) {
    console.error('Error fetching incidents:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
