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
