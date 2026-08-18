import { NextResponse } from 'next/server';
import { getIncidentsCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { parseSeverity } from '@/lib/severity';

export const dynamic = 'force-dynamic';

function formatDate(val: any): string {
  if (!val) return 'N/A';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return String(val);
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const collection = await getIncidentsCollection();

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

    const incident = {
      id: idStr,
      _id: idStr,
      incidentName: incType,
      severity: parseSeverity(doc.severity),
      agent: doc.agent_id || doc.host || 'Agent',
      agentsList: [doc.agent_id || doc.host || 'Agent'],
      host: doc.host || doc.agent_id || 'Unknown Host',
      firstObserved: formatDate(doc.first_observed),
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
      count: typeof doc.count === 'number' ? doc.count : 1,
      full_logs: typeof doc.full_logs === 'string' ? doc.full_logs : JSON.stringify(doc.full_logs || ''),
      tenant: 'Cyber Lab Head Office'
    };

    return NextResponse.json({ success: true, data: incident });
  } catch (error: any) {
    console.error('Error in GET /api/incidents/[id]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch incident detail' },
      { status: 500 }
    );
  }
}
