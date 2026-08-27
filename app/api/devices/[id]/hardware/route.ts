import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/tenant-context';
import { getTenantDeviceHardware } from '@/lib/wazuh-agent-store';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: 'Agent ID required' }, { status: 400 });
    }

    const tenant = getTenantContext(request);

    // Prioritas 1: Redis (<tenant.redisPrefix>:device:<id>:hardware) -> < 1ms
    // Prioritas 2 (Fallback): MongoDB (<tenant.databaseName>.devices WHERE id = id) -> 5-10ms
    const { data: hardware, source } = await getTenantDeviceHardware(id, tenant);

    return NextResponse.json({
      success: true,
      tenant: tenant.campusName,
      dataSource: source,
      data: hardware,
    });
  } catch (error: any) {
    console.error(`Error in GET /api/devices/[id]/hardware:`, error);
    return NextResponse.json({
      success: true,
      data: { cpuName: 'N/A', cores: 'N/A', ramTotal: 'N/A' },
    });
  }
}
