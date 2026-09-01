import { NextResponse } from 'next/server';
import { getIncidentsCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { parseSeverity } from '@/lib/severity';
import { getTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

function formatDate(val: any): string {
  if (!val) return 'N/A';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return String(val);
  }
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
    timestamp: doc.first_observed || doc.last_observed || new Date().toISOString(),
    rule: {
      id: doc.rule_id ? String(doc.rule_id) : '',
      level: doc.severity === 'Critical' ? 12 : doc.severity === 'High' ? 10 : doc.severity === 'Medium' ? 7 : 4,
      description: doc.description || doc.incident_type || '',
      mitre: {
        id: mitreIds,
        tactic: tactics,
        technique: techniques,
      },
    },
    agent: {
      id: doc.agent_id ? String(doc.agent_id) : (doc.agent || ''),
      name: doc.host || doc.agent || '',
      ip: doc.agent_ip || doc.ip_source || '',
    },
    manager: {
      name: 'wazuh.manager',
    },
    location: doc.affected_file || doc.location || '',
    data: {
      srcip: doc.ip_source || doc.agent_ip || '',
      dstip: doc.ip_destination || '',
      count: doc.count || 1,
      affected_file: doc.affected_file || '',
      incident_type: doc.incident_type || '',
    },
    full_log: `${doc.first_observed || new Date().toISOString()} ${doc.host || doc.agent || ''} ossec: Alert [${doc.rule_id || ''}] (${doc.severity || 'Medium'}): ${doc.description || doc.incident_type || ''}`,
  };

  return JSON.stringify(rawLogObj, null, 2);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi tidak valid atau telah berakhir.' },
        { status: 401 }
      );
    }

    const collection = await getIncidentsCollection(tenant.databaseName);

    let doc = null;
    if (ObjectId.isValid(id)) {
      doc = await collection.findOne({ _id: new ObjectId(id) });
    }
    if (!doc) {
      doc = await collection.findOne({ rule_id: id });
    }

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'Incident not found' },
        { status: 404 }
      );
    }

    const idStr = doc._id.toString();
    let incType = '';
    if (Array.isArray(doc.incident_type)) {
      incType = doc.incident_type.join(', ');
    } else if (typeof doc.incident_type === 'string' && doc.incident_type) {
      incType = doc.incident_type;
    } else {
      incType = doc.rule_id ? `Rule ${doc.rule_id}` : 'General Alert';
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

    const incident = {
      id: idStr,
      _id: idStr,
      incidentName: incType,
      severity: parseSeverity(doc.severity),
      agent: doc.agent_id || doc.host || doc.agent || '',
      agentsList: [doc.agent_id || doc.host || doc.agent || ''],
      host: doc.host || doc.agent_id || doc.agent || '',
      firstObserved: formatDate(doc.first_observed),
      lastObserved: formatDate(doc.last_observed || doc.first_observed),
      description: doc.description || incType || '',
      mitre: doc.mitre_id ? `${doc.mitre_id}` : (Array.isArray(doc.mitre_technique) ? doc.mitre_technique.join(', ') : (doc.mitre_technique || '')),
      mitre_id: doc.mitre_id || '',
      mitre_tactic: doc.mitre_tactic || '',
      mitre_technique: doc.mitre_technique || '',
      ruleId: doc.rule_id ? String(doc.rule_id) : undefined,
      rule_id: doc.rule_id ? String(doc.rule_id) : undefined,
      sourceIp: doc.ip_source || doc.agent_ip || '',
      agent_ip: doc.agent_ip || doc.ip_source || '',
      ip_source: doc.ip_source || doc.agent_ip || '',
      destIp: doc.ip_destination || '',
      ip_destination: doc.ip_destination || '',
      affected_file: doc.affected_file || undefined,
      count: typeof doc.count === 'number' ? doc.count : 1,
      full_logs: extractFullLogs(doc),

      tenant: tenant.campusName,

    };

    return NextResponse.json({ success: true, data: incident });
  } catch (error: any) {
    console.error('Error in GET /api/incidents/[id]:', error);
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Gagal memuat detail incident.'
          : error.message || 'Failed to fetch incident details',
      },
      { status: 500 }
    );
  }
}
