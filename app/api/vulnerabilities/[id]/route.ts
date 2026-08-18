import { NextResponse } from 'next/server';
import { getVulnerabilitiesCollection } from '@/lib/db';
import { ObjectId } from 'mongodb';

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
    const collection = await getVulnerabilitiesCollection();

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
    const statusFormatted = (doc.status === 'PASS' || doc.status === 'Patched') ? 'Patched' : 'Not Patched';

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
      detected_at: doc.detected_at ? String(doc.detected_at) : undefined,
      status: statusFormatted,
      currentVersion: doc.version || 'N/A',
      version: doc.version || 'N/A',
      description: doc.description || 'No detailed rationale provided for this vulnerability.',
      category: doc.category || 'Software',
      classification: doc.category || 'Software',
      ip: doc.ip || 'N/A'
    };

    return NextResponse.json({ success: true, data: vuln });
  } catch (error: any) {
    console.error('Error in GET /api/vulnerabilities/[id]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch vulnerability detail' },
      { status: 500 }
    );
  }
}
