import { NextResponse } from 'next/server';
import { getIncidentsCollection } from '@/lib/db';
import { parseSeverity } from '@/lib/severity';
import { getRiskCategory } from '@/lib/risk-score';
import { fetchIncidentsData } from '@/lib/redis-sync';

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

    const resInc = await fetchIncidentsData(timeRange);
    const rawIncidents = resInc.data || [];
    const incidents = rawIncidents.filter((inc) => matchesTimeRange(inc, timeRange, startDate, endDate));

    const tempMap = new Map<
      string,
      { critical: number; high: number; medium: number; low: number; issues: Set<string> }
    >();

    incidents.forEach((inc) => {
      const agentIdKey = String(inc.agent_id || inc.host || inc.agent || '').trim().toLowerCase();
      const hostKey = String(inc.host || '').trim().toLowerCase();
      const nameKey = String(inc.agent || '').trim().toLowerCase();

      const sev = parseSeverity(inc.severity).toLowerCase();
      const count = 1; // 1 document = 1 incident count!

      const issueText =
        (Array.isArray(inc.incident_type) ? inc.incident_type.join(', ') : inc.incident_type) ||
        inc.description ||
        (inc.rule_id ? `Rule ${inc.rule_id}` : 'Security Alert');

      const keysToUpdate = Array.from(new Set([agentIdKey, hostKey, nameKey])).filter(Boolean);

      keysToUpdate.forEach((key) => {
        if (!tempMap.has(key)) {
          tempMap.set(key, { critical: 0, high: 0, medium: 0, low: 0, issues: new Set<string>() });
        }
        const stat = tempMap.get(key)!;
        if (sev === 'critical') stat.critical += count;
        else if (sev === 'high') stat.high += count;
        else if (sev === 'medium') stat.medium += count;
        else stat.low += count;

        if (issueText && stat.issues.size < 5) {
          stat.issues.add(String(issueText));
        }
      });
    });

    tempMap.forEach((stats, key) => {
      // Rumus Agent Score: min(100, (Critical * 10) + (High * 6) + (Medium * 3))
      const rawScore = stats.critical * 10 + stats.high * 6 + stats.medium * 3;
      const score = Math.min(100, rawScore);
      const cat = getRiskCategory(score);

      scoresMap[key] = {
        criticalCount: stats.critical,
        highCount: stats.high,
        mediumCount: stats.medium,
        lowCount: stats.low,
        score,
        riskCategory: cat.label,
        detectedIssues: Array.from(stats.issues),
      };
    });

    return NextResponse.json({
      success: true,
      mongoDbAvailable: true,
      scoresMap,
    });
  } catch (error: any) {
    console.warn('[Risk Scores API] MongoDB fetch error, falling back to Redis:', error.message);
    try {
      const { searchParams } = new URL(request.url);
      const timeRange = searchParams.get('timeRange') || searchParams.get('timeFilter') || '';
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');

      const { data: rawIncidents } = await fetchIncidentsData(timeRange);
      const incidents = rawIncidents.filter((inc: any) => matchesTimeRange(inc, timeRange, startDate, endDate));

      const fallbackScoresMap: Record<string, any> = {};
      const tempMap = new Map<
        string,
        { critical: number; high: number; medium: number; low: number; issues: Set<string> }
      >();

      incidents.forEach((inc: any) => {
        const agentIdKey = String(inc.agent_id || inc.host || inc.agent || '').trim().toLowerCase();
        const hostKey = String(inc.host || '').trim().toLowerCase();
        const nameKey = String(inc.agent || '').trim().toLowerCase();

        const sev = parseSeverity(inc.severity).toLowerCase();
        const count = 1;

        const issueText =
          (Array.isArray(inc.incident_type) ? inc.incident_type.join(', ') : inc.incident_type) ||
          inc.description ||
          (inc.rule_id ? `Rule ${inc.rule_id}` : 'Security Alert');

        const keysToUpdate = Array.from(new Set([agentIdKey, hostKey, nameKey])).filter(Boolean);

        keysToUpdate.forEach((key) => {
          if (!tempMap.has(key)) {
            tempMap.set(key, { critical: 0, high: 0, medium: 0, low: 0, issues: new Set<string>() });
          }
          const stat = tempMap.get(key)!;
          if (sev === 'critical') stat.critical += count;
          else if (sev === 'high') stat.high += count;
          else if (sev === 'medium') stat.medium += count;
          else stat.low += count;

          if (issueText && stat.issues.size < 5) {
            stat.issues.add(String(issueText));
          }
        });
      });

      tempMap.forEach((stats, key) => {
        const rawScore = stats.critical * 10 + stats.high * 6 + stats.medium * 3;
        const score = Math.min(100, rawScore);
        const cat = getRiskCategory(score);

        fallbackScoresMap[key] = {
          criticalCount: stats.critical,
          highCount: stats.high,
          mediumCount: stats.medium,
          lowCount: stats.low,
          score,
          riskCategory: cat.label,
          detectedIssues: Array.from(stats.issues),
        };
      });

      return NextResponse.json({
        success: true,
        mongoDbAvailable: false,
        source: 'redis',
        warning: 'MongoDB offline. Risk scores dikalkulasi dari Redis cache.',
        scoresMap: fallbackScoresMap,
      });
    } catch {
      return NextResponse.json({
        success: true,
        mongoDbAvailable: false,
        warning: 'MongoDB & Redis tidak merespon.',
        scoresMap: {},
      });
    }
  }
}
