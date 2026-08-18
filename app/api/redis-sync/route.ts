import { NextResponse } from 'next/server';
import { syncIncidentsToRedis, syncVulnerabilitiesToRedis } from '@/lib/redis-sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const incidents = await syncIncidentsToRedis();
    const vulnerabilities = await syncVulnerabilitiesToRedis();

    return NextResponse.json({
      success: true,
      message: 'Redis 1-7 days data cache successfully synced from MongoDB',
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
