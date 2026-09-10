import { NextResponse } from 'next/server';
import { getReportsCollection } from '@/lib/db';
import { parseSeverity } from '@/lib/severity';
import { getRiskCategory } from '@/lib/risk-score';

import {
  queryDashboardIncidentStats,
  queryServerSideVulnerabilities,
  getHistoricalComparisonStats,
  getWeeklyHistoricalKpiFromRedis,
} from '@/lib/data-service';

import { getTenantContext } from '@/lib/tenant-context';
import { getTenantDeviceSummary, getTenantDevices } from '@/lib/wazuh-agent-store';
import { groupAlertsToIncidents } from '@/lib/incident-grouping';
import { getTimestamp, parseCustomDate } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

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

function getTimeRangeBounds(range: string, startDateParam?: string | null, endDateParam?: string | null) {
  const now = new Date();
  const lower = (range || 'today').toLowerCase();

  let startOfCurrent: Date;
  let endOfCurrent: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  let startOfPrevious: Date;
  let endOfPrevious: Date;

  let periodLabel = 'YESTERDAY';

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
      startOfCurrent = new Date(`${sStr}T00:00:00.000`);
      endOfCurrent = new Date(`${eStr}T23:59:59.999`);
      if (isNaN(startOfCurrent.getTime())) startOfCurrent = new Date(0);
      if (isNaN(endOfCurrent.getTime())) endOfCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const durationMs = Math.max(1, endOfCurrent.getTime() - startOfCurrent.getTime());
      startOfPrevious = new Date(startOfCurrent.getTime() - durationMs);
      endOfPrevious = new Date(startOfCurrent.getTime() - 1);
      periodLabel = 'PREVIOUS PERIOD';
    } else {
      startOfCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      endOfCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      startOfPrevious = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
      endOfPrevious = startOfCurrent;
      periodLabel = 'PREVIOUS PERIOD';
    }
  } else if (lower === 'today') {
    startOfCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    endOfCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    startOfPrevious = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
    endOfPrevious = startOfCurrent;
    periodLabel = 'YESTERDAY';
  } else if (lower === 'this week' || lower === '7d') {
    const dayOfWeek = now.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    const mondayThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0);
    startOfCurrent = mondayThisWeek;
    endOfCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    startOfPrevious = new Date(startOfCurrent.getTime() - 7 * 24 * 60 * 60 * 1000);
    endOfPrevious = startOfCurrent;
    periodLabel = 'LAST WEEK';
  } else if (lower === 'this month' || lower === '30d') {
    startOfCurrent = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    endOfCurrent = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    startOfPrevious = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    endOfPrevious = startOfCurrent;
    periodLabel = 'LAST MONTH';
  } else {
    // All
    startOfCurrent = new Date(0);
    startOfPrevious = new Date(0);
    endOfPrevious = new Date(0);
    periodLabel = 'PREVIOUS PERIOD';
  }

  return { startOfCurrent, endOfCurrent, startOfPrevious, endOfPrevious, periodLabel };
}

function getDocDate(doc: any): Date | null {
  const raw = doc.last_observed || doc.lastObserved || doc.first_observed || doc.firstObserved || doc.detected_at || doc.detectionDate || doc.date_generated || doc.date || doc.created_at;
  if (!raw) return null;
  return parseCustomDate(raw);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timeFilter = searchParams.get('timeFilter') || searchParams.get('timeRange') || 'Today';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');


    // Get Tenant Context from authenticated session
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi autentikasi tidak valid atau telah berakhir.' },
        { status: 401 }
      );
    }

    // 1. Fetch Devices strictly for tenant
    const { data: summaryData } = await getTenantDeviceSummary(tenant);
    const { data: devicesList, source: deviceSource } = await getTenantDevices(tenant);

    const totalDevices = summaryData.total_devices || devicesList.length;
    const onlineDevices = summaryData.online_devices;
    const offlineDevices = summaryData.offline_devices;

    const registeredAgentKeys = devicesList.map((a) => String(a.name || a.agent || a.id).trim().toLowerCase());

    // 2. Fetch Incidents and Top Incidents via high-speed server aggregation / Redis Cache
    const incResult = await queryDashboardIncidentStats(
      tenant.databaseName,
      tenant.redisPrefix,
      timeFilter,
      startDate,
      endDate,
      registeredAgentKeys,
      tenant.campusName
    );

    const currentStats = incResult.stats;
    const dataSource = incResult.source;
    const topIncidents = incResult.topIncidents;

    const { startOfCurrent, endOfCurrent, periodLabel } = getTimeRangeBounds(timeFilter, startDate, endDate);

    // Query comparison data directly from Redis Cache or historical_statistics collection in MongoDB
    const histComp = await getHistoricalComparisonStats(tenant.databaseName, timeFilter, startDate, endDate, tenant.redisPrefix);

    const previousStats = {
      critical: histComp.criticalPrev,
      high: histComp.highPrev,
      medium: histComp.mediumPrev,
      low: histComp.lowPrev,
      total: histComp.totalPrev,
      score: histComp.riskPrev,
    };

    const dynamicPeriodLabel = histComp.periodLabel || periodLabel;

    const criticalDelta = currentStats.critical - previousStats.critical;
    const highDelta = currentStats.high - previousStats.high;
    const mediumDelta = currentStats.medium - previousStats.medium;
    const totalDelta = currentStats.total - previousStats.total;

    const riskScore = Number(Number(currentStats.score || 0).toFixed(1));
    const riskLastMonth = Number(Number(previousStats.score || 0).toFixed(1));


    // 4. Fetch Vulnerabilities count and severity breakdown via high-speed server aggregation
    let vulnTotal = 0;
    let vulnCritical = 0;
    let vulnHigh = 0;
    let vulnMedium = 0;
    let vulnPatched = 0;
    try {
      const vulnRes = await queryServerSideVulnerabilities(
        tenant.databaseName,
        tenant.redisPrefix,
        {
          timeRange: timeFilter,
          startDate,
          endDate,
          limit: 1,
        }
      );
      vulnTotal = vulnRes.total;
      vulnCritical = vulnRes.stats.critical;
      vulnHigh = vulnRes.stats.high;
      vulnMedium = vulnRes.stats.medium;
      vulnPatched = vulnRes.stats.solved;
    } catch (err: any) {
      console.warn('[DashboardStats] Vulnerability stats query error:', err.message);
    }


    // 5. Fetch Reports for this tenant (strictly only reports that have genuine recommended actions)

    let reportsCount = 0;
    let recommendedActions: any[] = [];
    try {
      const repCol = await getReportsCollection(tenant.databaseName);

      const reps = await repCol.find({}).sort({ _id: -1 }).toArray();

      const filteredReps = reps.filter((r) => {
        if (timeFilter.toLowerCase() === 'all') return true;
        const d = getDocDate(r);
        return !d || (d >= startOfCurrent && d <= endOfCurrent);
      });

      reportsCount = filteredReps.length;
      recommendedActions = filteredReps
        .filter((r) => {
          const actionText = Array.isArray(r.recommended_action || r.recommendedAction || r.recommended_actions)
            ? (r.recommended_action || r.recommendedAction || r.recommended_actions).join(', ').trim()
            : String(r.recommended_action || r.recommendedAction || r.recommended_actions || '').trim();
          return actionText !== '' && actionText.toLowerCase() !== 'no recommended action specified.' && actionText.toLowerCase() !== 'n/a' && actionText.toLowerCase() !== '-';
        })
        .map((r) => {
          const actionText = Array.isArray(r.recommended_action || r.recommendedAction || r.recommended_actions)
            ? (r.recommended_action || r.recommendedAction || r.recommended_actions).join(', ').trim()
            : String(r.recommended_action || r.recommendedAction || r.recommended_actions || '').trim();
          const rawDate = r.date_generated || r.synced_at || (r._id && r._id.getTimestamp ? r._id.getTimestamp() : null);
          const rawTimestamp = rawDate ? new Date(rawDate).getTime() : 0;

          return {
            id: r._id.toString(),
            reportId: r._id.toString(),
            action: actionText,
            severity: parseSeverity(r.severity),
            date: formatDate(rawDate),
            rawDate: rawTimestamp,
            time: '',
          };
        });
    } catch {
      // fallback
    }

    return NextResponse.json({
      success: true,
      tenant: tenant.campusName,
      database: tenant.databaseName,
      dataSource: {
        devices: deviceSource,
        incidents: dataSource,
        historicalStats: histComp.source || 'mongodb',
      },
      data: {
        devices: {
          total: totalDevices,
          online: onlineDevices,
          offline: offlineDevices,
        },
        incidents: {
          critical: currentStats.critical,
          criticalPrev: previousStats.critical,
          criticalDelta,
          high: currentStats.high,
          highPrev: previousStats.high,
          highDelta,
          medium: currentStats.medium,
          mediumPrev: previousStats.medium,
          mediumDelta,
          low: currentStats.low,
          total: currentStats.total,
          totalPrev: previousStats.total,
          totalDelta,
        },
        vulnerabilities: {
          total: vulnTotal,
          critical: vulnCritical,
          high: vulnHigh,
          medium: vulnMedium,
          patched: vulnPatched,
        },
        reports: {
          total: reportsCount,
        },
        recommendedActions,
        riskScore: riskScore,
        riskLastMonth: riskLastMonth,
        periodLabel: dynamicPeriodLabel,
        topIncidents,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/dashboard/stats:', error);
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Gagal memuat statistik dashboard.'
          : error.message || 'Failed to fetch dashboard statistics',
      },
      { status: 500 }
    );
  }
}
