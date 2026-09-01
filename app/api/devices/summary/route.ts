import { NextResponse } from 'next/server';
import { getIncidentsCollection } from '@/lib/db';
import { parseSeverity } from '@/lib/severity';
import { getTenantContext } from '@/lib/tenant-context';
import { getTenantDeviceSummary } from '@/lib/wazuh-agent-store';

export const dynamic = 'force-dynamic';

function matchesTimeRange(doc: any, range: string, startDateParam?: string | null, endDateParam?: string | null): boolean {
  if (!range || range.toLowerCase() === 'all') return true;

  const rawDate = doc.last_observed || doc.first_observed || doc.detected_at || doc.date || doc.created_at || (doc._id && typeof doc._id.getTimestamp === 'function' ? doc._id.getTimestamp() : null);
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


    // Prioritas 1: Redis (<tenant.redisPrefix>:devices:summary) -> < 1ms
    // Prioritas 2 (Fallback): MongoDB (<tenant.databaseName>.device_summary) -> 5-10ms
    const { data: summaryData, source } = await getTenantDeviceSummary(tenant);

    // 2. Fetch severity breakdown from MongoDB
    let totalCritical = 0;
    let totalHigh = 0;
    let totalMedium = 0;
    let mongoDbAvailable = true;

    try {
      const mongoPromise = (async () => {
        const incCol = await getIncidentsCollection(tenant.databaseName);
        return incCol.find({}, { projection: { full_logs: 0 } }).maxTimeMS(800).toArray();
      })();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('MongoDB timeout 800ms')), 800)
      );

      const rawIncidents = await Promise.race([mongoPromise, timeoutPromise]);
      const incidents = rawIncidents.filter((inc) => matchesTimeRange(inc, timeRange, startDate, endDate));

      incidents.forEach((inc) => {
        const sev = parseSeverity(inc.severity).toLowerCase();
        const count = 1;
        if (sev === 'critical') totalCritical += count;
        else if (sev === 'high') totalHigh += count;
        else if (sev === 'medium') totalMedium += count;
      });
    } catch {
      mongoDbAvailable = false;
    }

    const colors = ['#3B82F6', '#A855F7', '#F97316', '#10B981', '#F59E0B', '#6366F1'];
    let colorIdx = 0;

    const osDistribution = Object.entries(summaryData.os_distribution || {}).map(([label, value]) => ({
      label,
      value,
      color: colors[colorIdx++ % colors.length],
    }));

    return NextResponse.json({
      success: true,
      tenant: tenant.campusName,
      database: tenant.databaseName,
      dataSource: source,
      data: {
        totalDevices: summaryData.total_devices || 0,
        onlineDevices: summaryData.online_devices || 0,
        offlineDevices: summaryData.offline_devices || 0,
        osDistribution,
        devicesAtRisk: {
          critical: totalCritical,
          high: totalHigh,
          medium: totalMedium,
        },
      },
      meta: {
        dataSource: source,
        mongoDbAvailable,
      },
    });
  } catch (error: any) {
    console.error('[API /api/devices/summary] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Gagal memuat ringkasan perangkat.'
          : error.message || 'Failed to fetch devices summary',
      },
      { status: 500 }
    );
  }
}
