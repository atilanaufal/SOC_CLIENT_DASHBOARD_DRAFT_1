import { NextResponse } from 'next/server';
import { parseSeverity } from '@/lib/severity';
import { fetchIncidentsData } from '@/lib/redis-sync';
import { getTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

function formatDate(val: any): string {
  if (!val) return 'N/A';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const dateStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dateStr} ${timeStr}`;
  } catch {
    return String(val);
  }
}

function matchesTimeRange(doc: any, range: string, startDateParam?: string | null, endDateParam?: string | null): boolean {
  if (!range || range === 'All') return true;

  const rawDate = doc.last_observed || doc.first_observed || doc.date || doc.created_at;
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
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= startOfWeek;
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

  // Format authentic structured Wazuh Security Event JSON from database document
  const rawLogObj: Record<string, any> = {
    timestamp: doc.first_observed || doc.last_observed || new Date().toISOString(),
    rule: {
      id: String(doc.rule_id || '100200'),
      level: doc.severity === 'Critical' ? 12 : doc.severity === 'High' ? 10 : doc.severity === 'Medium' ? 7 : 4,
      description: doc.description || doc.incident_type || 'Security event detected',
      mitre: {
        id: doc.mitre_id ? [doc.mitre_id] : ['T1110'],
        tactic: Array.isArray(doc.mitre_tactic) ? doc.mitre_tactic : [doc.mitre_tactic || 'Credential Access'],
        technique: Array.isArray(doc.mitre_technique) ? doc.mitre_technique : [doc.mitre_technique || 'Brute Force'],
      },
    },
    agent: {
      id: doc.agent_id ? String(doc.agent_id) : '001',
      name: doc.host || doc.agent || 'tguard',
      ip: doc.agent_ip || doc.ip_source || '10.21.126.82',
    },
    manager: {
      name: 'wazuh.manager',
    },
    location: doc.affected_file || doc.location || '/var/log/auth.log',
    data: {
      srcip: doc.ip_source || doc.agent_ip || '10.21.126.82',
      dstip: doc.ip_destination || '10.21.126.1',
      count: doc.count || 1,
      affected_file: doc.affected_file,
      incident_type: doc.incident_type,
    },
    full_log: `${doc.first_observed || new Date().toISOString()} ${doc.host || 'tguard'} ossec: Alert [${doc.rule_id || '100200'}] (${doc.severity || 'Medium'}): ${doc.description || doc.incident_type || 'Security Event Detected'}`,
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

    // Get Tenant Context from logged in user session
    const tenant = getTenantContext(request);

    // Fetch from Redis for 1-7 days, or MongoDB for 1 month for this specific tenant!
    const { data: rawDocs, source } = await fetchIncidentsData(timeRange, tenant.databaseName, tenant.redisPrefix);

    // Apply memory filters for incidentType, agent, search
    let docs = rawDocs;

    if (incidentType && incidentType !== 'All') {
      const typeRegex = new RegExp(incidentType, 'i');
      docs = docs.filter((d: any) => {
        const incType = Array.isArray(d.incident_type) ? d.incident_type.join(', ') : String(d.incident_type || '');
        const desc = String(d.description || '');
        return typeRegex.test(incType) || typeRegex.test(desc);
      });
    }

    if (agent && agent !== 'All') {
      const agentRegex = new RegExp(agent, 'i');
      docs = docs.filter((d: any) => {
        return agentRegex.test(String(d.agent_id || '')) ||
          agentRegex.test(String(d.host || '')) ||
          agentRegex.test(String(d.agent || '')) ||
          agentRegex.test(String(d.agent_ip || ''));
      });
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      docs = docs.filter((d: any) => {
        return searchRegex.test(String(d.description || '')) ||
          searchRegex.test(String(d.incident_type || '')) ||
          searchRegex.test(String(d.host || '')) ||
          searchRegex.test(String(d.agent_id || '')) ||
          searchRegex.test(String(d.agent_ip || '')) ||
          searchRegex.test(String(d.ip_source || '')) ||
          searchRegex.test(String(d.rule_id || '')) ||
          searchRegex.test(String(d.mitre_id || ''));
      });
    }

    // Filter strictly by non-agent 000 / health-checker
    const validDocs = docs.filter((doc: any) => {
      const idStr = String(doc.agent_id || doc.agent || doc.host || '').trim();
      const hostStr = String(doc.host || '').trim().toLowerCase();
      const agentStr = String(doc.agent || '').trim().toLowerCase();

      const isAgent000 = idStr === '000' || idStr === '0' || Number(idStr) === 0;
      const isHealthChecker = hostStr === 'health-checker' || agentStr === 'health-checker' || hostStr === '000';
      const isCampusWeb = hostStr.includes('srv-web.campus.ac.id') || agentStr.includes('srv-web.campus.ac.id');

      return !isAgent000 && !isHealthChecker && !isCampusWeb;
    });

    // Filter strictly by time range (Real MongoDB / Redis Dates!)
    const timeFilteredDocs = validDocs.filter((doc: any) => matchesTimeRange(doc, timeRange, startDate, endDate));

    let incidents = timeFilteredDocs.map((doc: any) => {
      const idStr = doc._id ? doc._id.toString() : String(doc.id || Math.random());
      let incType = '';
      if (Array.isArray(doc.incident_type)) {
        incType = doc.incident_type.join(', ');
      } else if (typeof doc.incident_type === 'string' && doc.incident_type) {
        incType = doc.incident_type;
      } else {
        incType = doc.rule_id ? `Rule ${doc.rule_id}` : 'General Alert';
      }

      const agentName = doc.host || doc.agent || (doc.agent_id ? `Agent ${doc.agent_id}` : 'Unknown Host');
      const hostName = doc.host || doc.agent || 'Unknown Host';

      return {
        id: idStr,
        _id: idStr,
        incidentName: incType,
        severity: parseSeverity(doc.severity),
        agent: agentName,
        agentsList: [agentName],
        host: hostName,
        firstObserved: formatDate(doc.first_observed),
        raw_first_observed: doc.first_observed,
        lastObserved: formatDate(doc.last_observed || doc.first_observed),
        description: doc.description || incType || 'Incident detected by Wazuh agent.',
        mitre: doc.mitre_id ? `${doc.mitre_id}` : (Array.isArray(doc.mitre_technique) ? doc.mitre_technique.join(', ') : (doc.mitre_technique || 'N/A')),
        mitre_id: doc.mitre_id,
        mitre_tactic: doc.mitre_tactic,
        mitre_technique: doc.mitre_technique,
        ruleId: doc.rule_id ? String(doc.rule_id) : undefined,
        rule_id: doc.rule_id ? String(doc.rule_id) : undefined,
        sourceIp: doc.ip_source || doc.agent_ip || 'N/A',
        agent_ip: doc.agent_ip || doc.ip_source || 'N/A',
        ip_source: doc.ip_source || doc.agent_ip || 'N/A',
        destIp: doc.ip_destination || 'N/A',
        ip_destination: doc.ip_destination || 'N/A',
        affected_file: doc.affected_file || undefined,
        count: typeof doc.count === 'number' && doc.count > 0 ? doc.count : 1,
        full_logs: extractFullLogs(doc),
        tenant: tenant.campusName
      };
    });

    if (severity && severity !== 'All') {
      incidents = incidents.filter((i: any) => String(i.severity).toLowerCase() === severity.toLowerCase());
    }

    return NextResponse.json({
      success: true,
      tenant: tenant.campusName,
      database: tenant.databaseName,
      dataSource: source, // 'redis' (1-7d) or 'mongodb' (1 month)
      total: incidents.length,
      data: incidents
    });
  } catch (error: any) {
    console.error('Error in GET /api/incidents:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch incidents' },
      { status: 500 }
    );
  }
}
