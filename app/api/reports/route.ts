import { NextResponse } from 'next/server';
import { getReportsCollection } from '@/lib/db';
import { getTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

import { parseCustomDate } from '@/lib/date-utils';

function formatDate(val: any): string {
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

function matchesTimeRange(doc: any, range: string, startDateParam?: string | null, endDateParam?: string | null): boolean {
  if (!range || range.toLowerCase() === 'all') return true;

  const rawDate = doc.date_generated || doc.synced_at || doc.created_at || doc.date || (doc._id && typeof doc._id.getTimestamp === 'function' ? doc._id.getTimestamp() : null);
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const severity = searchParams.get('severity') || '';
    const timeRange = searchParams.get('timeRange') || searchParams.get('timeFilter') || '';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');


    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi tidak valid atau telah berakhir.' },
        { status: 401 }
      );
    }


    const collection = await getReportsCollection(tenant.databaseName);

    const query: Record<string, any> = {};

    if (severity && severity !== 'All') {
      query.severity = { $regex: new RegExp(`^${severity}$`, 'i') };
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { report_name: searchRegex },
        { summary: searchRegex },
        { recommended_action: searchRegex },
        { soc_id: searchRegex },
        { report_uuid: searchRegex }
      ];
    }

    const docs = await collection.find(query).sort({ _id: -1 }).toArray();

    // Filter reports by time range
    const timeFilteredDocs = docs.filter((doc) => matchesTimeRange(doc, timeRange, startDate, endDate));

    const reports = timeFilteredDocs.map((doc) => {
      const idStr = doc._id.toString();
      const rawDate = doc.date_generated || (doc._id && typeof doc._id.getTimestamp === 'function' ? doc._id.getTimestamp() : null);

      return {
        id: idStr,
        _id: idStr,
        reportName: doc.report_name || `Report #${doc.report_id || ''}`,
        report_name: doc.report_name || `Report #${doc.report_id || ''}`,
        report_id: doc.report_id,
        report_uuid: doc.report_uuid,
        soc_id: doc.soc_id,
        severity: doc.severity || 'Unspecified',
        dateGenerated: formatDate(rawDate),
        date_generated: rawDate ? (rawDate instanceof Date ? rawDate.toISOString() : String(rawDate)) : undefined,
        lastUpdated: formatDate(doc.synced_at || rawDate),
        synced_at: doc.synced_at ? String(doc.synced_at) : undefined,
        summary: doc.summary || 'No summary description provided.',
        recommendedAction: doc.recommended_action || 'No recommended action specified.',
        recommended_action: doc.recommended_action || 'No recommended action specified.',
        type: 'Security Alert Incident',
        tenant: tenant.campusName
      };
    });

    return NextResponse.json({
      success: true,
      tenant: tenant.campusName,
      total: reports.length,
      data: reports
    });
  } catch (error: any) {
    console.error('Error in GET /api/reports:', error);
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Gagal memuat laporan DFIR.'
          : error.message || 'Failed to fetch reports',
      },
      { status: 500 }
    );
  }
}
