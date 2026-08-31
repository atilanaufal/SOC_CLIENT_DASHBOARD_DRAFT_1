import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant-context';
import { getTenantDevices, WazuhDevice } from '@/lib/wazuh-agent-store';

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
<<<<<<< Updated upstream
    const tenant = getTenantContext(request);
=======
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi tidak valid atau telah berakhir.' },
        { status: 401 }
      );
    }
>>>>>>> Stashed changes

    // Prioritas 1: Redis Cache (<tenant.redisPrefix>:devices:list) -> < 1ms
    // Prioritas 2 (Safety Net): MongoDB (<tenant.databaseName>.devices) -> 5-10ms
    const { data: storedDevices, source } = await getTenantDevices(tenant);

    const devices = storedDevices.map((dev: WazuhDevice) => {
      const osName = typeof dev.os === 'string' ? dev.os : (dev.os_name || 'Ubuntu');
      const rawStatus = (dev.status || dev.raw_status || '').toLowerCase();
      const status: 'Online' | 'Offline' = rawStatus === 'online' || rawStatus === 'active' ? 'Online' : 'Offline';

      const dateFormatted = formatDate(dev.last_keepalive);
      const agoFormatted = formatAgo(dev.last_keepalive);

<<<<<<< Updated upstream
      const cpu = dev.cpu || dev.hardware?.cpu_name || 'AMD Ryzen 5 6600H with Radeon Graphics';
      const cores = dev.cores || (dev.hardware?.cores ? String(dev.hardware.cores) : '4');
      const ram = dev.ram || dev.hardware?.ram_total || '7.8 GB';
=======
      const cpu = dev.cpu || dev.hardware?.cpu_name || 'N/A';
      const cores = dev.cores || (dev.hardware?.cores ? String(dev.hardware.cores) : 'N/A');
      const ram = dev.ram || dev.hardware?.ram_total || 'N/A';
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
        ipAddress: dev.ip || '127.0.0.1',
=======
        ipAddress: dev.ip || '',
>>>>>>> Stashed changes
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
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        score: 0,
        riskCategory: 'Low',
        risk: 'Low (0)',
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
<<<<<<< Updated upstream
    console.error('[API /api/devices] Error fetching devices from store:', error.message);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch devices' },
=======
    console.error('[API /api/devices] Error fetching devices:', error.message);
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === 'production'
          ? 'Gagal memuat data perangkat.'
          : error.message || 'Failed to fetch devices',
      },
>>>>>>> Stashed changes
      { status: 500 }
    );
  }
}
