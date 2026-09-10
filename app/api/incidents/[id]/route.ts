import { NextResponse } from 'next/server';
import { getIncidentsCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { parseSeverity } from '@/lib/severity';
import { getTenantContext } from '@/lib/tenant-context';
import { parseCustomDate } from '@/lib/date-utils';
import { extractFullLogs } from '@/lib/incident-grouping';

export const dynamic = 'force-dynamic';

function formatDate(val: any): string {
  if (!val) return 'N/A';
  try {
    const d = parseCustomDate(val);
    if (!d || isNaN(d.getTime())) return String(val);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
    const { searchParams } = new URL(request.url);
    const sampleId = searchParams.get('sampleId');

    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi tidak valid atau telah berakhir.' },
        { status: 401 }
      );
    }

    const collection = await getIncidentsCollection(tenant.databaseName);

    let doc: any = null;

    // 1. Try sampleId if provided
    if (sampleId && ObjectId.isValid(sampleId)) {
      doc = await collection.findOne({ _id: new ObjectId(sampleId) });
    }

    // 2. Try direct ObjectId
    if (!doc && ObjectId.isValid(id)) {
      doc = await collection.findOne({ _id: new ObjectId(id) });
    }

    // 3. Try parsing group ID if starts with inc_grp_
    if (!doc && id.startsWith('inc_grp_')) {
      const clean = id.replace(/^inc_grp_/, '');
      const parts = clean.split(':::');
      if (parts.length >= 2) {
        const query: any = {};
        if (parts[0]) query.rule_id = parts[0];
        if (parts[1]) query.host = new RegExp(`^${parts[1]}$`, 'i');
        doc = await collection.findOne(query, { sort: { first_observed: -1 } });
      }
    }

    // 4. Try matching rule_id
    if (!doc) {
      doc = await collection.findOne({ rule_id: id });
    }

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'Incident not found' },
        { status: 404 }
      );
    }

    const idStr = doc._id ? doc._id.toString() : id;
    const rawIncType = doc.incident_type
      ? (Array.isArray(doc.incident_type) ? doc.incident_type.join(', ') : String(doc.incident_type))
      : '';
    const incName = rawIncType || doc.description || (doc.rule_id ? `Rule ${doc.rule_id}` : 'General Alert');
    const logs = extractFullLogs(doc);

    const incident = {
      id: idStr,
      _id: idStr,
      sample_id: idStr,
      incidentName: incName,
      incident_type: rawIncType,
      severity: parseSeverity(doc.severity),
      agent: doc.agent_id || doc.host || doc.agent || '',
      agentsList: [doc.agent_id || doc.host || doc.agent || ''],
      host: doc.host || doc.agent_id || doc.agent || '',
      firstObserved: formatDate(doc.first_observed),
      lastObserved: formatDate(doc.last_observed || doc.first_observed),
      description: doc.description || '',
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
      full_logs: logs,
      full_log: logs,
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
