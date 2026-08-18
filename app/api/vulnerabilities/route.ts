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
    const dateStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dateStr} ${timeStr}`;
  } catch {
    return String(val);
  }
}

function matchesTimeRange(doc: any, range: string, startDateParam?: string | null, endDateParam?: string | null): boolean {
  if (!range || range === 'All') return true;

  const rawDate = doc.detected_at || doc.last_seen || doc.first_seen || doc.date || doc.created_at || (doc._id && typeof doc._id.getTimestamp === 'function' ? doc._id.getTimestamp() : null);
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

import { fetchVulnerabilitiesData } from '@/lib/redis-sync';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const severity = searchParams.get('severity') || '';
    const status = searchParams.get('status') || '';
    const category = searchParams.get('category') || '';
    const agent = searchParams.get('agent') || '';
    const timeRange = searchParams.get('timeRange') || searchParams.get('timeFilter') || '';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Fetch from Redis for 1-7 days, or MongoDB for 1 month
    const { data: rawDocs, source } = await fetchVulnerabilitiesData(timeRange);

    let docs = rawDocs;

    if (severity && severity !== 'All') {
      const sevRegex = new RegExp(`^${severity}$`, 'i');
      docs = docs.filter((d: any) => sevRegex.test(String(d.severity || '')));
    }

    if (status && status !== 'All') {
      const isPatched = status.toLowerCase() === 'patched';
      docs = docs.filter((d: any) => {
        const st = String(d.status || '').toLowerCase();
        const docIsPatched = st === 'patched' || st === 'pass';
        return isPatched ? docIsPatched : !docIsPatched;
      });
    }

    if (category && category !== 'All') {
      const catRegex = new RegExp(category, 'i');
      docs = docs.filter((d: any) => catRegex.test(String(d.category || '')));
    }

    if (agent && agent !== 'All') {
      const agentRegex = new RegExp(agent, 'i');
      docs = docs.filter((d: any) => agentRegex.test(String(d.agent || '')) || agentRegex.test(String(d.ip || '')));
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      docs = docs.filter((d: any) => {
        return searchRegex.test(String(d.cve || '')) ||
          searchRegex.test(String(d.vulnerability || '')) ||
          searchRegex.test(String(d.agent || '')) ||
          searchRegex.test(String(d.ip || '')) ||
          searchRegex.test(String(d.description || '')) ||
          searchRegex.test(String(d.category || ''));
      });
    }

    const timeFilteredDocs = docs.filter((doc: any) => matchesTimeRange(doc, timeRange, startDate, endDate));

    const vulnerabilities = timeFilteredDocs.map((doc: any) => {
      const idStr = doc._id ? doc._id.toString() : String(doc.id || Math.random());
      const statusFormatted = (doc.status === 'PASS' || doc.status === 'Patched') ? 'Patched' : 'Not Patched';

      return {
        id: idStr,
        _id: idStr,
        name: doc.vulnerability || doc.cve || 'Vulnerability',
        vulnerability: doc.vulnerability || doc.cve || 'Vulnerability',
        severity: doc.severity || 'Medium',
        agent: (doc.agent || doc.host || 'Unknown Agent').replace(/-agent$/i, '').trim(),
        cveId: doc.cve || 'N/A',
        cve: doc.cve || 'N/A',
        detectionDate: formatDate(doc.detected_at || (doc._id && typeof doc._id.getTimestamp === 'function' ? doc._id.getTimestamp() : null)),
        detected_at: doc.detected_at ? String(doc.detected_at) : undefined,
        status: statusFormatted,
        currentVersion: doc.version || 'N/A',
        version: doc.version || 'N/A',
        description: doc.description || 'No detailed rationale provided for this vulnerability.',
        category: doc.category || 'Software',
        classification: doc.category || 'Software',
        ip: doc.ip || 'N/A'
      };
    });

    return NextResponse.json({
      success: true,
      dataSource: source, // 'redis' (1-7d) or 'mongodb' (1 month)
      total: vulnerabilities.length,
      data: vulnerabilities
    });
  } catch (error: any) {
    console.error('Error in GET /api/vulnerabilities:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch vulnerabilities' },
      { status: 500 }
    );
  }
}
