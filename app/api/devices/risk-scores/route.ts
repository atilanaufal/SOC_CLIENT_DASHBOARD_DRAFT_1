import { NextResponse } from 'next/server';
import { parseSeverity } from '@/lib/severity';
import { getRiskCategory } from '@/lib/risk-score';

import { queryDeviceRiskScores } from '@/lib/data-service';

import { getTenantContext } from '@/lib/tenant-context';
import { parseCustomDate } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';

function matchesTimeRange(doc: any, range: string, startDateParam?: string | null, endDateParam?: string | null): boolean {
  if (!range || range.toLowerCase() === 'all') return true;

  const rawDate = doc.lastObserved || doc.firstObserved || doc.last_observed || doc.first_observed || doc.detected_at || doc.date || doc.created_at;
  if (!rawDate) return true;

  const d = parseCustomDate(rawDate);
  if (!d || isNaN(d.getTime())) return true;

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
  const scoresMap: Record<
    string,
    {
      criticalCount: number;
      highCount: number;
      mediumCount: number;
      lowCount: number;
      score: number;
      riskCategory: string;
      detectedIssues: string[];
    }
  > = {};

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

    const scoresMap = await queryDeviceRiskScores(
      tenant.databaseName,
      tenant.redisPrefix,
      timeRange,
      startDate,
      endDate
    );

    return NextResponse.json({
      success: true,
      tenant: tenant.campusName,
      mongoDbAvailable: true,
      scoresMap,
    });
  } catch (error: any) {

    console.warn('[Risk Scores API] Error fetching risk scores:', error.message);
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Gagal memuat skor risiko.'
          : error.message || 'Failed to fetch device risk scores',
        scoresMap: {},
      },
      { status: 500 }
    );

  }
}
