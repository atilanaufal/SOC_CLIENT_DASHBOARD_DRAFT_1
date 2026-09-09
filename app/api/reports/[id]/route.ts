import { NextResponse } from 'next/server';
import { getReportsCollection } from '@/lib/db';
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

    const collection = await getReportsCollection(tenant.databaseName);

    let doc = null;
    if (ObjectId.isValid(id)) {
      doc = await collection.findOne({ _id: new ObjectId(id) });
    }
    if (!doc && !isNaN(Number(id))) {
      doc = await collection.findOne({ report_id: Number(id) });
    }
    if (!doc) {
      doc = await collection.findOne({ report_uuid: id });
    }

    if (!doc) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    const idStr = doc._id.toString();

    const report = {
      id: idStr,
      _id: idStr,
      reportName: doc.report_name || `Report #${doc.report_id || ''}`,
      report_name: doc.report_name || `Report #${doc.report_id || ''}`,
      report_id: doc.report_id,
      report_uuid: doc.report_uuid,
      soc_id: doc.soc_id,
      severity: doc.severity || 'Unspecified',
      dateGenerated: formatDate(doc.date_generated),
      date_generated: doc.date_generated ? (doc.date_generated instanceof Date ? doc.date_generated.toISOString() : String(doc.date_generated)) : undefined,
      lastUpdated: formatDate(doc.synced_at || doc.date_generated),
      synced_at: doc.synced_at ? String(doc.synced_at) : undefined,
      summary: doc.summary || 'No summary description provided.',
      recommendedAction: doc.recommended_action || 'No recommended action specified.',
      recommended_action: doc.recommended_action || 'No recommended action specified.',
      type: 'Security Alert Incident',
      tenant: tenant.campusName,
    };

    return NextResponse.json({ success: true, data: report });
  } catch (error: any) {
    console.error('Error in GET /api/reports/[id]:', error);
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Gagal memuat detail laporan.'
          : error.message || 'Failed to fetch report detail',
      },
      { status: 500 }
    );
  }
}
