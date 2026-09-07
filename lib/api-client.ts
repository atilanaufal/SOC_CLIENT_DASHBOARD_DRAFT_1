import { Incident, Vulnerability, SecurityReport, Device } from '@/lib/types';

export async function fetchIncidents(filters?: {
  search?: string;
  severity?: string;
  incidentType?: string;
  agent?: string;
  timeRange?: string;
  startDate?: string;
  endDate?: string;
}): Promise<Incident[] & { stats?: any }> {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.severity && filters.severity !== 'All') params.set('severity', filters.severity);
  if (filters?.incidentType && filters.incidentType !== 'All') params.set('incidentType', filters.incidentType);
  if (filters?.agent && filters.agent !== 'All') params.set('agent', filters.agent);
  if (filters?.timeRange && filters.timeRange !== 'All') params.set('timeRange', filters.timeRange);
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);

  const res = await fetch(`/api/incidents?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch incidents: ${res.statusText}`);
  }
  const json = await res.json();
  const list = (json.data || []) as any;
  list.stats = json.incidents || null;
  return list;
}

export interface FetchVulnerabilitiesResponse {
  data: Vulnerability[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export async function fetchVulnerabilities(filters?: {
  search?: string;
  severity?: string;
  status?: string;
  category?: string;
  agent?: string;
  timeRange?: string;
  startDate?: string;
  endDate?: string;
  offset?: number;
  limit?: number;
}): Promise<FetchVulnerabilitiesResponse> {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.severity && filters.severity !== 'All') params.set('severity', filters.severity);
  if (filters?.status && filters.status !== 'All') params.set('status', filters.status);
  if (filters?.category && filters.category !== 'All') params.set('category', filters.category);
  if (filters?.agent && filters.agent !== 'All') params.set('agent', filters.agent);
  if (filters?.timeRange && filters.timeRange !== 'All') params.set('timeRange', filters.timeRange);
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);
  if (typeof filters?.offset === 'number') params.set('offset', String(filters.offset));
  if (typeof filters?.limit === 'number') params.set('limit', String(filters.limit));

  const res = await fetch(`/api/vulnerabilities?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch vulnerabilities: ${res.statusText}`);
  }
  const json = await res.json();
  return {
    data: json.data || [],
    total: json.total ?? (json.data || []).length,
    offset: json.offset || 0,
    limit: json.limit || 1000,
    hasMore: Boolean(json.hasMore),
  };
}

export async function fetchReports(filters?: {
  search?: string;
  severity?: string;
  timeRange?: string;
  startDate?: string;
  endDate?: string;
}): Promise<SecurityReport[]> {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.severity && filters.severity !== 'All') params.set('severity', filters.severity);
  if (filters?.timeRange && filters.timeRange !== 'All') params.set('timeRange', filters.timeRange);
  if (filters?.startDate) params.set('startDate', filters.startDate);
  if (filters?.endDate) params.set('endDate', filters.endDate);

  const res = await fetch(`/api/reports?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch reports: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data || [];
}

export async function fetchDashboardStats(
  timeFilter?: string,
  customRange?: { startDate?: string; endDate?: string } | null
) {
  const params = new URLSearchParams();
  if (timeFilter && timeFilter !== 'All') params.set('timeFilter', timeFilter);
  if (customRange?.startDate) params.set('startDate', customRange.startDate);
  if (customRange?.endDate) params.set('endDate', customRange.endDate);

  const res = await fetch(`/api/dashboard/stats?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch dashboard stats: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
}

export async function fetchDevices(): Promise<{ data: Device[]; meta?: any }> {
  const res = await fetch('/api/devices', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch devices: ${res.statusText}`);
  }
  const json = await res.json();
  return { data: json.data || [], meta: json.meta };
}

export async function fetchDeviceRiskScores(
  timeRange?: string,
  customRange?: { startDate?: string; endDate?: string } | null
): Promise<{
  mongoDbAvailable: boolean;
  warning?: string;
  scoresMap: Record<string, any>;
}> {
  const params = new URLSearchParams();
  if (timeRange && timeRange !== 'All') params.set('timeRange', timeRange);
  if (customRange?.startDate) params.set('startDate', customRange.startDate);
  if (customRange?.endDate) params.set('endDate', customRange.endDate);

  const res = await fetch(`/api/devices/risk-scores?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) {
    return {
      mongoDbAvailable: false,
      warning: 'MongoDB tidak merespon (timed out). Severity breakdown dan risk score sementara 0.',
      scoresMap: {},
    };
  }
  const json = await res.json();
  return {
    mongoDbAvailable: json.mongoDbAvailable ?? false,
    warning: json.warning,
    scoresMap: json.scoresMap || {},
  };
}

export async function fetchDeviceHardware(agentId: string): Promise<{
  cpuName: string;
  cores: string | number;
  ramTotal: string;
}> {
  try {
    const res = await fetch(`/api/devices/${agentId}/hardware`, { cache: 'no-store' });
    if (!res.ok) return { cpuName: 'N/A', cores: 'N/A', ramTotal: 'N/A' };
    const json = await res.json();
    return json.data || { cpuName: 'N/A', cores: 'N/A', ramTotal: 'N/A' };
  } catch {
    return { cpuName: 'N/A', cores: 'N/A', ramTotal: 'N/A' };
  }
}

export async function fetchDevicesSummary() {
  const res = await fetch('/api/devices/summary', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch devices summary: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data;
}
