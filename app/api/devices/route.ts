import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant-context';
import { getTenantDevices, WazuhDevice } from '@/lib/wazuh-agent-store';
import { getTenantIncidents } from '@/lib/data-service';
import { parseSeverity } from '@/lib/severity';
import { getRiskCategory } from '@/lib/risk-score';

export const dynamic = 'force-dynamic';

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const tStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dStr} ${tStr}`;
  } catch {
    return String(dateStr);
  }
}

function formatAgo(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) {
      return 'Just now';
    } else if (diffHours < 1) {
      return `${diffMins} Mins Ago`;
    } else if (diffHours < 24) {
      return `${diffHours} Hours Ago`;
    } else {
      return `${diffDays} Days Ago`;
    }
  } catch {
    return '';
  }
}

export async function GET(request: Request) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi tidak valid atau telah berakhir.' },
        { status: 401 }
      );
    }

    // Prioritas 1: Redis Cache (<tenant.redisPrefix>:devices:list) -> < 1ms
    // Prioritas 2 (Safety Net): MongoDB (<tenant.databaseName>.devices) -> 5-10ms
    const { data: storedDevices, source } = await getTenantDevices(tenant);

    // Fetch tenant incidents to aggregate severity breakdown and risk score per agent
    const agentStatsMap = new Map<string, { critical: number; high: number; medium: number; low: number }>();
    try {
      const rawIncidents = await getTenantIncidents(tenant.databaseName, tenant.redisPrefix);
      rawIncidents.forEach((inc) => {
        const idStr = String(inc.agent_id || inc.agent || inc.host || '').trim();
        const hostStr = String(inc.host || inc.agent || '').trim().toLowerCase();
        const agentStr = String(inc.agent || inc.host || '').trim().toLowerCase();
        const ipStr = String(inc.agent_ip || inc.sourceIp || inc.ip_source || '').trim().toLowerCase();

        if (idStr === '000' || idStr === '0' || hostStr === 'health-checker') return;

        const sev = parseSeverity(inc.severity).toLowerCase();
        const keys = Array.from(new Set([idStr, hostStr, agentStr, ipStr])).filter(Boolean);

        keys.forEach((k) => {
          if (!agentStatsMap.has(k)) {
            agentStatsMap.set(k, { critical: 0, high: 0, medium: 0, low: 0 });
          }
          const s = agentStatsMap.get(k)!;
          if (sev === 'critical') s.critical++;
          else if (sev === 'high') s.high++;
          else if (sev === 'medium') s.medium++;
          else s.low++;
        });
      });
    } catch (e) {
      console.warn('[API /api/devices] Failed to fetch incidents:', e);
    }

    const devices = storedDevices.map((dev: WazuhDevice) => {
      const osName = typeof dev.os === 'string' ? dev.os : (dev.os_name || 'Ubuntu');
      const rawStatus = (dev.status || dev.raw_status || '').toLowerCase();
      const status: 'Online' | 'Offline' = rawStatus === 'online' || rawStatus === 'active' ? 'Online' : 'Offline';

      const dateFormatted = formatDate(dev.last_keepalive);
      const agoFormatted = formatAgo(dev.last_keepalive);

      const cpu = dev.cpu || dev.hardware?.cpu_name || 'N/A';
      const cores = dev.cores || (dev.hardware?.cores ? String(dev.hardware.cores) : 'N/A');
      const ram = dev.ram || dev.hardware?.ram_total || 'N/A';

      const devId = String(dev.id || '').trim();
      const devName = String(dev.name || dev.agent || '').trim().toLowerCase();
      const devIp = String(dev.ip || '').trim().toLowerCase();

      const stats =
        agentStatsMap.get(devId) ||
        agentStatsMap.get(devName) ||
        agentStatsMap.get(devIp) ||
        { critical: 0, high: 0, medium: 0, low: 0 };

      const rawScore = stats.critical * 6 + stats.high * 3 + stats.medium * 1;
      const scoreVal = Math.min(100, rawScore);
      const cat = getRiskCategory(scoreVal);

      return {
        id: dev.id,
        agent: dev.name || dev.agent || `Agent-${dev.id}`,
        os: osName,
        status,
        lastSeenDate: dateFormatted,
        lastSeenAgo: agoFormatted,
        lastSeen: agoFormatted ? `${dateFormatted} (${agoFormatted})` : dateFormatted,
        rawLastKeepAlive: dev.last_keepalive,
        registrationDate: formatDate(dev.date_add),
        dateAdd: dev.date_add,
        ipAddress: dev.ip || '',
        agentVersion: dev.version || 'Wazuh Agent',
        manager: 'Wazuh Manager',
        nodeName: 'N/A',
        group: dev.group || [tenant.databaseName],
        cpu,
        cores,
        ram,
        hardware: {
          cpu_name: cpu,
          cores,
          ram_total: ram,
        },
        criticalCount: stats.critical,
        highCount: stats.high,
        mediumCount: stats.medium,
        lowCount: stats.low,
        score: scoreVal,
        riskCategory: cat.label,
        risk: `${cat.label} (${scoreVal})`,
        detectedIssues: [],
        tenant: tenant.campusName,
      };
    });

    return NextResponse.json({
      success: true,
      tenant: tenant.campusName,
      database: tenant.databaseName,
      dataSource: source,
      total: devices.length,
      data: devices,
    });
  } catch (error: any) {

    console.error('[API /api/devices] Error fetching devices:', error.message);
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Gagal memuat data perangkat.'
          : error.message || 'Failed to fetch devices',
      },

      { status: 500 }
    );
  }
}
