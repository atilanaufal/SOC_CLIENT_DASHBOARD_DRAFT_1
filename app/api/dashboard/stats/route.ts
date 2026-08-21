import { NextResponse } from 'next/server';
import { fetchWazuhAgents, WazuhAgent } from '@/lib/wazuh-api';
import { getIncidentsCollection, getVulnerabilitiesCollection, getReportsCollection } from '@/lib/db';
import { parseSeverity } from '@/lib/severity';
import { getRiskCategory } from '@/lib/risk-score';
import { fetchIncidentsData, fetchVulnerabilitiesData } from '@/lib/redis-sync';

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

function getTimeRangeBounds(range: string, startDateParam?: string | null, endDateParam?: string | null) {
  const now = new Date();
  const lower = (range || 'today').toLowerCase();

  let startOfCurrent: Date;
  let endOfCurrent: Date = now;

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
      if (isNaN(endOfCurrent.getTime())) endOfCurrent = now;

      const durationMs = Math.max(1, endOfCurrent.getTime() - startOfCurrent.getTime());
      startOfPrevious = new Date(startOfCurrent.getTime() - durationMs);
      endOfPrevious = new Date(startOfCurrent.getTime() - 1);
      periodLabel = 'PREVIOUS PERIOD';
    } else {
      startOfCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startOfPrevious = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      endOfPrevious = startOfCurrent;
      periodLabel = 'PREVIOUS PERIOD';
    }
  } else if (lower === 'today') {
    startOfCurrent = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startOfPrevious = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    endOfPrevious = startOfCurrent;
    periodLabel = 'YESTERDAY';
  } else if (lower === 'this week' || lower === '7d') {
    startOfCurrent = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    startOfPrevious = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    endOfPrevious = startOfCurrent;
    periodLabel = 'LAST WEEK';
  } else if (lower === 'this month' || lower === '30d') {
    startOfCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
    startOfPrevious = new Date(now.getFullYear(), now.getMonth() - 1, 1);
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
  const raw = doc.last_observed || doc.first_observed || doc.detected_at || doc.date_generated || doc.synced_at || doc.date || doc.created_at || (doc._id && typeof doc._id.getTimestamp === 'function' ? doc._id.getTimestamp() : null);
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timeFilter = searchParams.get('timeFilter') || searchParams.get('timeRange') || 'Today';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let totalDevices = 0;
    let onlineDevices = 0;
    let offlineDevices = 0;
    let rawActiveAgentsList: WazuhAgent[] = [];

    // 1. Fetch Agents from Wazuh Server API (Fast)
    try {
      rawActiveAgentsList = await fetchWazuhAgents();
    } catch (err: any) {
      console.warn('[API /api/dashboard/stats] Wazuh API error:', err.message);
    }

    // Exclude Agent 000 / health-checker from active agents
    const activeAgentsList = rawActiveAgentsList.filter((ag) => {
      const idStr = String(ag.id || '').trim();
      const nameStr = String(ag.name || '').trim().toLowerCase();
      return idStr !== '000' && idStr !== '0' && nameStr !== 'health-checker';
    });

    totalDevices = activeAgentsList.length;
    activeAgentsList.forEach((agent) => {
      const st = (agent.status || '').toLowerCase();
      if (st === 'active') onlineDevices++;
      else offlineDevices++;
    });

    // 2. Fetch Incidents from Redis (1-7 days) or MongoDB (1 month)
    let rawIncidents: any[] = [];
    let dataSource: string = 'mongodb';
    try {
      const res = await fetchIncidentsData(timeFilter);
      rawIncidents = res.data;
      dataSource = res.source;
    } catch (err: any) {
      console.warn('[API /api/dashboard/stats] Incidents fetch fallback:', err.message);
    }

    const { startOfCurrent, endOfCurrent, startOfPrevious, endOfPrevious, periodLabel } = getTimeRangeBounds(timeFilter, startDate, endDate);

    // Filter out agent 000 / health-checker
    const validIncidents = rawIncidents.filter((inc) => {
      const idStr = String(inc.agent_id || inc.agent || inc.host || '').trim();
      const hostStr = String(inc.host || '').trim().toLowerCase();
      const agentStr = String(inc.agent || '').trim().toLowerCase();

      const isAgent000 = idStr === '000' || idStr === '0' || Number(idStr) === 0;
      const isHealthChecker = hostStr === 'health-checker' || agentStr === 'health-checker' || hostStr === '000';
      const isCampusWeb = hostStr.includes('srv-web.campus.ac.id') || agentStr.includes('srv-web.campus.ac.id');

      return !isAgent000 && !isHealthChecker && !isCampusWeb;
    });

    const currentIncidents = validIncidents.filter((inc) => {
      const d = getDocDate(inc);
      if (!d) return true;
      if (timeFilter.toLowerCase() === 'all') return true;
      return d >= startOfCurrent && d <= endOfCurrent;
    });

    const previousIncidents = validIncidents.filter((inc) => {
      const d = getDocDate(inc);
      if (!d) return false;
      if (timeFilter.toLowerCase() === 'all') return false;
      return d >= startOfPrevious && d < endOfPrevious;
    });

    // Map each agent identifier (ID / Name / IP) to a single canonical agent key
    const normalizeAgentId = (raw: any): string => {
      const s = String(raw || '').trim().toLowerCase();
      if (!s || s === '000' || s === '0' || s === 'health-checker') return '';

      for (const ag of activeAgentsList) {
        const aid = String(ag.id || '').trim().toLowerCase();
        const aname = String(ag.name || '').trim().toLowerCase();
        const aip = String(ag.ip || '').trim().toLowerCase();
        if (s === aid || s === aname || (aip && s === aip)) {
          return aname || aid; // Use agent name as canonical key (e.g., 'tguard', 'fd-1664')
        }
      }
      return s;
    };

    // Valid Registered Active Agents Names (e.g., 'tguard', 'fd-1664' -> Exactly 2 registered agents!)
    const registeredAgentKeys = activeAgentsList.map((a) => String(a.name || a.id).trim().toLowerCase());

    const calculateDashboardMetrics = (list: any[]) => {
      let critical = 0;
      let high = 0;
      let medium = 0;
      let low = 0;
      const agentSeverityMap: Record<string, { critical: number; high: number; medium: number }> = {};

      list.forEach((inc) => {
        const sev = parseSeverity(inc.severity).toLowerCase();
        const count = 1; // Strictly 1 document = 1 incident count for KPI totals!

        if (sev === 'critical') critical += count;
        else if (sev === 'high') high += count;
        else if (sev === 'medium') medium += count;
        else low += count;

        const canonicalKey = normalizeAgentId(inc.agent_id || inc.host || inc.agent);
        if (canonicalKey) {
          if (!agentSeverityMap[canonicalKey]) {
            agentSeverityMap[canonicalKey] = { critical: 0, high: 0, medium: 0 };
          }
          if (sev === 'critical') agentSeverityMap[canonicalKey].critical += count;
          else if (sev === 'high') agentSeverityMap[canonicalKey].high += count;
          else if (sev === 'medium') agentSeverityMap[canonicalKey].medium += count;
        }
      });

      // Target agents list: exact list of registered agents (e.g. 2 agents: tguard and fd-1664)
      const targetAgents = registeredAgentKeys.length > 0
        ? registeredAgentKeys
        : Object.keys(agentSeverityMap);

      const totalAgentsCount = Math.max(1, targetAgents.length);
      let sumAgentScores = 0;

      targetAgents.forEach((agentKey) => {
        const st = agentSeverityMap[agentKey] || { critical: 0, high: 0, medium: 0 };
        const agentScore = Math.min(100, st.critical * 10 + st.high * 6 + st.medium * 3);
        sumAgentScores += agentScore;
      });

      // Dashboard Risk Score = SUM(Score(Agent_i)) / Total Agents (e.g. (36 + 3) / 2 = 19.5!)
      const avgDashboardRiskScore = Math.round((sumAgentScores / totalAgentsCount) * 10) / 10;

      return {
        critical,
        high,
        medium,
        low,
        total: critical + high + medium + low,
        score: avgDashboardRiskScore,
      };
    };

    const currentStats = calculateDashboardMetrics(currentIncidents);
    const previousStats = calculateDashboardMetrics(previousIncidents);

    const criticalDelta = currentStats.critical - previousStats.critical;
    const highDelta = currentStats.high - previousStats.high;
    const mediumDelta = currentStats.medium - previousStats.medium;
    const totalDelta = currentStats.total - previousStats.total;

    const riskScore = currentStats.score;
    const riskLastMonth = previousStats.score;
    const riskCat = getRiskCategory(riskScore);

    // 3. Top Incidents (Separate by Name AND Date, always use latest timestamp)
    const topIncidentsMap = new Map<string, any>();
    currentIncidents.forEach((inc) => {
      const incType = Array.isArray(inc.incident_type) ? inc.incident_type.join(', ') : (inc.incident_type || '');
      const name = incType || inc.description || `Rule ${inc.rule_id}`;
      const agentName = inc.host || inc.agent || (inc.agent_id ? `Agent ${inc.agent_id}` : 'Agent');

      const rawDateVal = inc.last_observed || inc.first_observed || inc.date;
      const dateFormatted = formatDate(rawDateVal);
      const rawTimestamp = rawDateVal ? new Date(rawDateVal).getTime() : 0;

      // Group key includes Name AND Date string so different dates are NOT merged!
      const groupKey = `${name}_${dateFormatted.split(' ')[0] || ''}_${agentName}`;

      const incCount = typeof inc.count === 'number' && inc.count > 0 ? inc.count : 1;

      if (!topIncidentsMap.has(groupKey)) {
        topIncidentsMap.set(groupKey, {
          id: (inc._id ? inc._id.toString() : String(inc.id || Math.random())),
          incidentName: name,
          severity: parseSeverity(inc.severity),
          agent: agentName,
          agentsList: [agentName],
          host: agentName,
          count: incCount,
          firstObserved: formatDate(inc.first_observed || rawDateVal),
          lastObserved: dateFormatted, // Always latest timestamp
          rawDate: rawTimestamp,
          ruleId: inc.rule_id ? String(inc.rule_id) : 'N/A'
        });
      } else {
        const item = topIncidentsMap.get(groupKey);
        if (!item.agentsList.includes(agentName)) {
          item.agentsList.push(agentName);
        }
        item.count += incCount;
        if (rawTimestamp > item.rawDate) {
          item.rawDate = rawTimestamp;
          item.lastObserved = dateFormatted;
        }
      }
    });

    const topIncidents = Array.from(topIncidentsMap.values()).sort((a, b) => b.rawDate - a.rawDate);

    // 4. Fetch Vulnerabilities count fast (from Redis for 1-7 days, or Mongo for 1 month)
    let vulnTotal = 0;
    let vulnCritical = 0;
    let vulnHigh = 0;
    let vulnMedium = 0;
    let vulnPatched = 0;
    try {
      const resVulns = await fetchVulnerabilitiesData(timeFilter);
      const vulns = resVulns.data;
      const filteredVulns = vulns.filter((v) => {
        if (timeFilter.toLowerCase() === 'all') return true;
        const d = getDocDate(v);
        return !d || (d >= startOfCurrent && d <= endOfCurrent);
      });

      vulnTotal = filteredVulns.length;
      filteredVulns.forEach((v) => {
        const s = parseSeverity(v.severity).toLowerCase();
        if (s === 'critical') vulnCritical += 1;
        else if (s === 'high') vulnHigh += 1;
        else if (s === 'medium') vulnMedium += 1;

        const st = String(v.status || '').trim().toLowerCase();
        if (st === 'solved' || st === 'pass' || st === 'patched') vulnPatched += 1;
      });
    } catch {
      // fallback
    }

    // 5. Fetch Reports count fast (filtered by time range)
    let reportsCount = 0;
    let recommendedActions: any[] = [];
    try {
      const repCol = await getReportsCollection();
      const reps = await repCol.find({}).sort({ _id: -1 }).maxTimeMS(500).toArray();
      const filteredReps = reps.filter((r) => {
        if (timeFilter.toLowerCase() === 'all') return true;
        const d = getDocDate(r);
        return !d || (d >= startOfCurrent && d <= endOfCurrent);
      });

      reportsCount = filteredReps.length;
      recommendedActions = filteredReps.map((r) => ({
        id: r._id.toString(),
        reportId: r._id.toString(),
        action: r.recommended_action || r.summary || 'Security mitigation action required',
        severity: parseSeverity(r.severity),
        date: formatDate(r.date_generated || r.synced_at || (r._id && r._id.getTimestamp ? r._id.getTimestamp() : null)),
        time: '',
      }));
    } catch {
      // fallback
    }

    return NextResponse.json({
      success: true,
      dataSource, // 'redis' (1-7d) or 'mongodb' (1 month)
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
        riskScore: riskScore, // Returned strictly as average number: (36 + 3) / 2 = 19.5!
        riskLastMonth: riskLastMonth,
        periodLabel,
        topIncidents,
      },
    });
  } catch (error: any) {
    console.error('[API /api/dashboard/stats] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
