import { NextResponse } from 'next/server';
import { queryServerSideVulnerabilities } from '@/lib/data-service';
import { getTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const severity = searchParams.get('severity') || '';
    const status = searchParams.get('status') || '';
    const category = searchParams.get('category') || '';
    const vulnerability = searchParams.get('vulnerability') || '';
    const agent = searchParams.get('agent') || '';
    const timeRange = searchParams.get('timeRange') || searchParams.get('timeFilter') || '';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '10', 10)));
    const sortBy = searchParams.get('sortBy') || 'detectionDate';
    const sortOrder = (searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

    // Authenticated Tenant Context
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sesi tidak valid atau telah berakhir.' },
        { status: 401 }
      );
    }

    // High-performance MongoDB $facet aggregation (Wazuh / OpenSearch style)
    const result = await queryServerSideVulnerabilities(
      tenant.databaseName,
      tenant.redisPrefix,
      {
        page,
        limit,
        search,
        severity,
        status,
        category,
        vulnerability,
        agent,
        sortBy,
        sortOrder,
        timeRange,
        startDate,
        endDate,
      }
    );

    return NextResponse.json({
      success: true,
      tenant: tenant.campusName,
      database: tenant.databaseName,
      ...result,
    });
  } catch (error: any) {
    console.error('Error fetching server-side vulnerabilities:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
