import { NextResponse } from 'next/server';
<<<<<<< Updated upstream
import { fetchVulnerabilitiesData } from '@/lib/redis-sync';
=======
import { getTenantVulnerabilities } from '@/lib/data-service';
>>>>>>> Stashed changes
import { getTenantContext } from '@/lib/tenant-context';

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

  const rawDate = doc.detected_at || doc.detectionDate || doc.last_seen || doc.first_seen || doc.date || doc.created_at;
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
    const search = searchParams.get('search') || '';
    const severity = searchParams.get('severity') || '';
    const status = searchParams.get('status') || '';
    const category = searchParams.get('category') || '';
    const vulnerabilityParam = searchParams.get('vulnerability') || '';
    const agent = searchParams.get('agent') || '';
    const timeRange = searchParams.get('timeRange') || searchParams.get('timeFilter') || '';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

<<<<<<< Updated upstream
    // Get Tenant Context from logged in user session
    const tenant = getTenantContext(request);

    // Fetch from Redis / MongoDB strictly for this tenant
    const { data: rawDocs, source } = await fetchVulnerabilitiesData(timeRange, tenant.databaseName, tenant.redisPrefix);
=======
    // Authenticated Tenant Context
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi tidak valid atau telah berakhir.' },
        { status: 401 }
      );
    }
>>>>>>> Stashed changes

    // Query vulnerabilities directly for tenant (1-7 days from Redis, > 7 days from MongoDB)
    const rawDocs = await getTenantVulnerabilities(tenant.databaseName, tenant.redisPrefix, timeRange, startDate, endDate);
    let docs = rawDocs;

    if (severity && severity !== 'All') {
      const sevRegex = new RegExp(`^${severity}$`, 'i');
      docs = docs.filter((d: any) => sevRegex.test(String(d.severity || '')));
    }

    if (status && status !== 'All') {
      const isSolvedFilter = status.toLowerCase() === 'solved' || status.toLowerCase() === 'patched';
      docs = docs.filter((d: any) => {
        const st = String(d.status || '').trim().toLowerCase();
        const docIsSolved = st === 'solved' || st === 'pass' || st === 'patched';
        return isSolvedFilter ? docIsSolved : !docIsSolved;
      });
    }

    if (category && category !== 'All') {
      const catRegex = new RegExp(category, 'i');
      docs = docs.filter((d: any) => catRegex.test(String(d.category || '')));
    }

    if (vulnerabilityParam && vulnerabilityParam !== 'All') {
      const vRegex = new RegExp(`^${vulnerabilityParam}$`, 'i');
      docs = docs.filter((d: any) => vRegex.test(String(d.vulnerability || d.name || d.cve || '')));
    }

    if (agent && agent !== 'All') {
      const agentRegex = new RegExp(agent, 'i');
      docs = docs.filter((d: any) => {
        const h = String(d.host || d.agent || '');
        return agentRegex.test(h);
      });
    }

    if (timeRange && timeRange !== 'All') {
      docs = docs.filter((d: any) => matchesTimeRange(d, timeRange, startDate, endDate));
    }

<<<<<<< Updated upstream
    const vulnerabilities = timeFilteredDocs.map((doc: any) => {
      const idStr = doc._id ? doc._id.toString() : String(doc.id || Math.random());
      const rawStatus = String(doc.status || '').trim().toLowerCase();
      const statusFormatted = (rawStatus === 'solved' || rawStatus === 'pass' || rawStatus === 'patched') ? 'Solved' : 'Not Patched';
=======
    const mapped = docs.map((doc: any, index: number) => {
      let sev = String(doc.severity || 'Medium');
      sev = sev.charAt(0).toUpperCase() + sev.slice(1).toLowerCase();

      const isSolved =
        String(doc.status).toLowerCase() === 'solved' ||
        String(doc.status).toLowerCase() === 'pass' ||
        String(doc.status).toLowerCase() === 'patched';
>>>>>>> Stashed changes

      return {
        id: String(doc.id || doc._id || `vuln-${index + 1}`),
        _id: String(doc.id || doc._id || `vuln-${index + 1}`),
        name: doc.vulnerability || doc.name || doc.cve || 'Vulnerability',
        vulnerability: doc.vulnerability || doc.name || doc.cve || 'Vulnerability',
        severity: sev,
        agent: (doc.agent || doc.host || 'Unknown Agent').replace(/-agent$/i, '').trim(),
        cveId: doc.cve || doc.cveId || 'N/A',
        cve: doc.cve || doc.cveId || 'N/A',
        detectionDate: formatDate(doc.detected_at || doc.detectionDate),
        detected_at: doc.detected_at ? String(doc.detected_at) : undefined,
        status: isSolved ? 'Solved' : 'Not Patched',
        currentVersion: doc.version || doc.currentVersion || 'N/A',
        version: doc.version || doc.currentVersion || 'N/A',
        description: doc.description || 'No detailed rationale provided for this vulnerability.',
        impact: doc.impact || '',
        category: doc.category || 'Software',
        classification: doc.category || 'Software',
<<<<<<< Updated upstream
        ip: doc.ip || 'N/A',
        tenant: tenant.campusName
=======
        package: doc.package || '',
        ip: doc.ip || doc.agent_ip || 'N/A',
        tenant: tenant.campusName,
>>>>>>> Stashed changes
      };
    });

    let result = mapped;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.cveId.toLowerCase().includes(q) ||
          item.agent.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({
      success: true,
      tenant: tenant.campusName,
      database: tenant.databaseName,
<<<<<<< Updated upstream
      dataSource: source, // 'redis' (1-7d) or 'mongodb' (1 month)
      total: vulnerabilities.length,
      data: vulnerabilities
=======
      data: result,
      total: result.length,
>>>>>>> Stashed changes
    });
  } catch (error: any) {
    console.error('Error fetching vulnerabilities:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
