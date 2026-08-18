import { NextResponse } from 'next/server';
import { fetchWazuhAgents, WazuhAgent } from '@/lib/wazuh-api';

export const dynamic = 'force-dynamic';

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const dStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const tStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${dStr} ${tStr}`;
  } catch {
    return String(dateStr);
  }
}

function formatAgo(dateStr?: string): string {
  if (!dateStr) return 'N/A';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffHours < 1) {
      const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
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

export async function GET() {
  try {
    // Fetch Agents strictly from Wazuh Server API (Fast < 50ms)
    const wazuhAgents: WazuhAgent[] = await fetchWazuhAgents();

    const devices = wazuhAgents
      .filter((wAgent) => {
        const idStr = String(wAgent.id || '').trim();
        const nameStr = String(wAgent.name || '').trim().toLowerCase();
        return idStr !== '000' && idStr !== '0' && Number(idStr) !== 0 && nameStr !== 'wazuh.manager';
      })
      .map((wAgent) => {
        const osName = wAgent.os?.name || '';
        const osVersion = wAgent.os?.version || '';
        const osPlatform = wAgent.os?.platform || '';
        const osStr = [osName, osVersion].filter(Boolean).join(' ') || osPlatform || 'Linux / Unix';

        const rawStatus = (wAgent.status || '').toLowerCase();
        const status: 'Online' | 'Offline' = rawStatus === 'active' ? 'Online' : 'Offline';

        const dateFormatted = formatDate(wAgent.lastKeepAlive);
        const agoFormatted = formatAgo(wAgent.lastKeepAlive);

        return {
          id: wAgent.id,
          agent: wAgent.name || `Agent-${wAgent.id}`,
          os: osStr,
          status,
          lastSeenDate: dateFormatted,
          lastSeenAgo: agoFormatted,
          lastSeen: `${dateFormatted} (${agoFormatted})`,
          rawLastKeepAlive: wAgent.lastKeepAlive,
          registrationDate: formatDate(wAgent.dateAdd),
          dateAdd: wAgent.dateAdd,
          ipAddress: wAgent.ip || 'N/A',
          agentVersion: wAgent.version || 'Wazuh Agent',
          manager: wAgent.manager || 'Wazuh Manager',
          nodeName: wAgent.node_name || 'N/A',
          group: wAgent.group || ['default'],
          cpu: 'x86_64 / ARM',
          cores: 'Dynamic',
          ram: 'Dynamic',
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          score: 0,
          riskCategory: 'Low',
          risk: 'Low (0)',
          detectedIssues: [],
        };
      });

    return NextResponse.json({
      success: true,
      total: devices.length,
      data: devices,
      meta: {
        wazuhApiAvailable: true,
      },
    });
  } catch (error: any) {
    console.error('[API /api/devices] Error fetching Wazuh agents:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch Wazuh agents' },
      { status: 500 }
    );
  }
}
