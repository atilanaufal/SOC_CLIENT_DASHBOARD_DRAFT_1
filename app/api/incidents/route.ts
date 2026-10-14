import { NextResponse } from 'next/server';
import { queryServerSideIncidents } from '@/lib/data-service';
import { getTenantContextWithStatus, createAuthErrorResponse } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const severity = searchParams.get('severity') || '';
    const incidentType = searchParams.get('incidentType') || searchParams.get('incidentName') || '';
    const agent = searchParams.get('agent') || '';
    const timeRange = searchParams.get('timeRange') || searchParams.get('timeFilter') || '';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const groupBy = (searchParams.get('groupBy') || 'alerts').toLowerCase() === 'incidents' ? 'incidents' : 'alerts';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = searchParams.has('limit') ? parseInt(searchParams.get('limit')!, 10) : 10;
    const sortBy = searchParams.get('sortBy') || 'firstObserved';
    const sortOrder = (searchParams.get('sortOrder') || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    // Authenticated Tenant Context
    const { tenant, error } = await getTenantContextWithStatus(request);
    if (!tenant) {
      return createAuthErrorResponse(error);
    }

    const result = await queryServerSideIncidents(
      tenant.databaseName,
      tenant.redisPrefix,
      {
        page,
        limit,
        search,
        severity,
        incidentType,
        agent,
        sortBy,
        sortOrder,
        timeRange,
        startDate,
        endDate,
        groupBy,
        tenantName: tenant.campusName,
      }
    );

    return NextResponse.json({
      success: true,
      tenant: tenant.campusName,
      database: tenant.databaseName,
      dataSource: result.dataSource,
      groupBy: result.groupBy,
      data: result.data,
      total: result.total,
      totalAlerts: result.totalAlerts,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      incidents: result.incidents,
      stats: result.incidents,
      filterOptions: result.filterOptions,
    });
  } catch (error: any) {
    console.error('Error fetching incidents:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
