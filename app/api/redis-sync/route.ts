import { NextResponse } from 'next/server';
import { syncIncidentsToRedis, syncVulnerabilitiesToRedis } from '@/lib/redis-sync';
import { getTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const tenant = getTenantContext(request);
    const incidents = await syncIncidentsToRedis(tenant.databaseName, tenant.redisPrefix);
    const vulnerabilities = await syncVulnerabilitiesToRedis(tenant.databaseName, tenant.redisPrefix);

    return NextResponse.json({
      success: true,
      tenant: tenant.campusName,
      message: `Redis 1-7 days data cache successfully synced for ${tenant.campusName}`,
      stats: {
        incidentsSynced: incidents.length,
        vulnerabilitiesSynced: vulnerabilities.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/redis-sync:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to sync Redis data' },
      { status: 500 }
    );
  }
}
