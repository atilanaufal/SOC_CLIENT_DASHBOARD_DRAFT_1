import { NextResponse } from 'next/server';
import { getVulnerabilitiesCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';
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

    const collection = await getVulnerabilitiesCollection(tenant.databaseName);

    let doc = null;
    if (ObjectId.isValid(id)) {
      doc = await collection.findOne({ _id: new ObjectId(id) });
    }
    if (!doc) {
      doc = await collection.findOne({ cve: id });
    }

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'Vulnerability not found' },
        { status: 404 }
      );
    }

    const idStr = doc._id.toString();
    const rawStatus = String(doc.status || '').trim().toLowerCase();
    const statusFormatted = (rawStatus === 'solved' || rawStatus === 'pass' || rawStatus === 'patched') ? 'Solved' : 'Not Patched';

    const vuln = {
      id: idStr,
      _id: idStr,
      name: doc.vulnerability || doc.cve || 'Vulnerability',
      vulnerability: doc.vulnerability || doc.cve || 'Vulnerability',
      severity: doc.severity || 'Medium',
      agent: doc.agent || 'Unknown Agent',
      cveId: doc.cve || 'N/A',
      cve: doc.cve || 'N/A',
      detectionDate: formatDate(doc.detected_at),
      detected_at: doc.detected_at ? (doc.detected_at instanceof Date ? doc.detected_at.toISOString() : String(doc.detected_at)) : undefined,
      status: statusFormatted,
      currentVersion: doc.version || 'N/A',
      version: doc.version || 'N/A',
      description: doc.description || 'No detailed rationale provided for this vulnerability.',
      category: doc.category || 'Software',
      classification: doc.category || 'Software',
      ip: doc.ip || 'N/A',
      tenant: tenant.campusName,
    };

    return NextResponse.json({ success: true, data: vuln });
  } catch (error: any) {
    console.error('Error in GET /api/vulnerabilities/[id]:', error);
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Gagal memuat detail kerentanan.'
          : error.message || 'Failed to fetch vulnerability detail',
      },
      { status: 500 }
    );
  }
}
