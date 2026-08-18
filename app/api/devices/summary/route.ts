import { NextResponse } from 'next/server';
import { fetchWazuhAgents, WazuhAgent } from '@/lib/wazuh-api';
import { getIncidentsCollection } from '@/lib/db';
import { parseSeverity } from '@/lib/severity';

export const dynamic = 'force-dynamic';

function matchesTimeRange(doc: any, range: string, startDateParam?: string | null, endDateParam?: string | null): boolean {
  if (!range || range === 'All') return true;

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
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= startOfWeek;
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

    let totalDevices = 0;
    let onlineDevices = 0;
    let offlineDevices = 0;
    const osCounts: Record<string, number> = {};

    let wazuhApiAvailable = true;
    let mongoDbAvailable = true;

    // 1. Get Wazuh agents list fast
    try {
      const agents: WazuhAgent[] = await fetchWazuhAgents();
      totalDevices = agents.length;

      agents.forEach((agent: WazuhAgent) => {
        const st = (agent.status || '').toLowerCase();
        if (st === 'active') {
          onlineDevices++;
        } else {
          offlineDevices++;
        }

        const osName = agent.os?.name || agent.os?.platform || 'Unknown OS';
        osCounts[osName] = (osCounts[osName] || 0) + 1;
      });
    } catch (err: any) {
      console.warn('[API /api/devices/summary] Wazuh API error:', err.message);
      wazuhApiAvailable = false;
    }

    // 2. Fetch severity breakdown from MongoDB with timeout
    let totalCritical = 0;
    let totalHigh = 0;
    let totalMedium = 0;

    try {
      const mongoPromise = (async () => {
        const incCol = await getIncidentsCollection();
        return incCol.find({}, { projection: { full_logs: 0 } }).maxTimeMS(800).toArray();
      })();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('MongoDB timeout 800ms')), 800)
      );

      const rawIncidents = await Promise.race([mongoPromise, timeoutPromise]);
      const incidents = rawIncidents.filter((inc) => matchesTimeRange(inc, timeRange, startDate, endDate));

      incidents.forEach((inc) => {
        const sev = parseSeverity(inc.severity).toLowerCase();
        const count = 1; // 1 document = 1 incident count!
        if (sev === 'critical') totalCritical += count;
        else if (sev === 'high') totalHigh += count;
        else if (sev === 'medium') totalMedium += count;
      });
    } catch (err: any) {
      mongoDbAvailable = false;
    }

    const colors = ['#3B82F6', '#A855F7', '#F97316', '#10B981', '#F59E0B', '#6366F1'];
    let colorIdx = 0;

    const osDistribution = Object.entries(osCounts).map(([label, value]) => ({
      label,
      value,
      color: colors[colorIdx++ % colors.length],
    }));

    return NextResponse.json({
      success: true,
      data: {
        totalDevices,
        onlineDevices,
        offlineDevices,
        osDistribution,
        devicesAtRisk: {
          critical: totalCritical,
          high: totalHigh,
          medium: totalMedium,
        },
      },
      meta: {
        wazuhApiAvailable,
        mongoDbAvailable,
      },
    });
  } catch (error: any) {
    console.error('[API /api/devices/summary] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch devices summary' },
      { status: 500 }
    );
  }
}
