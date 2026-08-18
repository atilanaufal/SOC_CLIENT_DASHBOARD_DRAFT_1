import { NextResponse } from 'next/server';
import { fetchAgentHardware } from '@/lib/wazuh-api';

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

    const hardware = await fetchAgentHardware(id);
    return NextResponse.json({
      success: true,
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
