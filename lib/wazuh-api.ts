import https from 'https';
import fs from 'fs';

export interface WazuhOS {
  name?: string;
  version?: string;
  platform?: string;
  arch?: string;
  codename?: string;
  major?: string;
  minor?: string;
}

export interface WazuhAgent {
  id: string;
  name: string;
  ip?: string;
  status?: 'active' | 'disconnected' | 'never_connected' | 'pending' | string;
  lastKeepAlive?: string;
  version?: string;
  os?: WazuhOS;
  group?: string[];
  manager?: string;
  node_name?: string;
  registerIP?: string;
  dateAdd?: string;
}

export interface WazuhAgentSummary {
  connection_status?: {
    active?: number;
    disconnected?: number;
    never_connected?: number;
    pending?: number;
    total?: number;
  };
  [key: string]: any;
}

export interface WazuhHardwareInfo {
  cpuName?: string;
  cores?: string | number;
  ramTotal?: string;
  cpuMhz?: number;
}

// In-memory token & URL cache
let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let cachedWorkingUrl: string | null = null;

// Short-lived cache for agent endpoints (TTL 30s)
let cachedAgents: { data: WazuhAgent[]; timestamp: number } | null = null;
let cachedSummary: { data: WazuhAgentSummary; timestamp: number } | null = null;
const CACHE_TTL_MS = 30 * 1000;

function getWazuhConfig() {
  const primaryUrl = (process.env.WAZUH_API_URL || 'https://127.0.0.1:55000').replace(/\/$/, '');
  const fallbackUrl = (process.env.WAZUH_API_FALLBACK_URL || '').replace(/\/$/, '');
  const user = process.env.WAZUH_API_USER || 'wazuh-wui';
  const password = process.env.WAZUH_API_PASSWORD || '';
  const rejectUnauthorized = process.env.WAZUH_API_REJECT_UNAUTHORIZED !== 'false';
  const caPath = process.env.WAZUH_API_CA_PATH;

  let caCert: Buffer | undefined;
  if (caPath) {
    try {
      if (fs.existsSync(caPath)) {
        caCert = fs.readFileSync(caPath);
      }
    } catch (err: any) {
      console.warn('[Wazuh API] Failed to load CA certificate from path:', caPath, err.message);
    }
  }

  return { primaryUrl, fallbackUrl, user, password, rejectUnauthorized, caCert };
}

function getHttpsAgent(): https.Agent {
  const { rejectUnauthorized, caCert } = getWazuhConfig();
  return new https.Agent({
    rejectUnauthorized,
    ca: caCert,
    keepAlive: true,
  });
}

async function singleFetch(baseUrl: string, path: string, options: RequestInit = {}): Promise<Response> {
  const fullUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  const mergedOptions: RequestInit = {
    ...options,
    signal: controller.signal,
    headers: {
      ...defaultHeaders,
      ...(options.headers || {}),
    },
    // @ts-ignore
    agent: getHttpsAgent(),
    cache: 'no-store',
  };

  try {
    const res = await fetch(fullUrl, mergedOptions);
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Fetch against Wazuh Server API with fallback support
 */
async function wazuhFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { primaryUrl, fallbackUrl } = getWazuhConfig();

  const candidateUrls = (cachedWorkingUrl
    ? [cachedWorkingUrl, primaryUrl, fallbackUrl]
    : [primaryUrl, fallbackUrl]
  ).filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

  let lastError: any = null;

  for (const url of candidateUrls) {
    try {
      const response = await singleFetch(url, path, options);
      cachedWorkingUrl = url;
      return response;
    } catch (err: any) {
      console.warn(`[Wazuh API] Fetch failed on ${url}: ${err.message}`);
      lastError = err;
      if (cachedWorkingUrl === url) {
        cachedWorkingUrl = null;
      }
    }
  }

  throw new Error(`Wazuh Server API unreachable (${primaryUrl}): ${lastError?.message || 'Network Timeout'}`);
}

/**
 * Authenticate with Wazuh Server API and obtain a JWT Token.
 * POST /security/user/authenticate?raw=true
 */
export async function getWazuhToken(forceNew = false): Promise<string> {
  const now = Date.now();
  if (!forceNew && cachedToken && tokenExpiresAt > now + 2 * 60 * 1000) {
    return cachedToken;
  }

  const { user, password } = getWazuhConfig();
  const credentials = Buffer.from(`${user}:${password}`).toString('base64');

  try {
    const response = await wazuhFetch('/security/user/authenticate?raw=true', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      cachedToken = null;
      tokenExpiresAt = 0;
      throw new Error(`Wazuh auth failed (${response.status}): ${errorText || response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let token = '';

    if (contentType.includes('application/json')) {
      const json = await response.json();
      token = json.data?.token || json.token || json;
    } else {
      token = (await response.text()).trim();
    }

    if (!token) {
      throw new Error('Wazuh API returned an empty JWT token');
    }

    cachedToken = token;
    tokenExpiresAt = now + 13 * 60 * 1000;
    return token;
  } catch (error: any) {
    console.error('[Wazuh API] Authentication error:', error.message);
    throw error;
  }
}

/**
 * Fetch list of agents from Wazuh Server API (GET /agents).
 * Agent ID '000', '0', and 'wazuh.manager' are strictly excluded.
 */
export async function fetchWazuhAgents(forceRefresh = false): Promise<WazuhAgent[]> {
  const now = Date.now();
  if (!forceRefresh && cachedAgents && now - cachedAgents.timestamp < CACHE_TTL_MS) {
    return cachedAgents.data;
  }

  try {
    let token = await getWazuhToken();
    let response = await wazuhFetch('/agents?limit=500', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}` as string,
      },
    });

    if (response.status === 401) {
      token = await getWazuhToken(true);
      response = await wazuhFetch('/agents?limit=500', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` as string },
      });
    }

    if (!response.ok) {
      throw new Error(`Failed GET /agents (${response.status}): ${response.statusText}`);
    }

    const json = await response.json();
    const rawItems: WazuhAgent[] = json.data?.affected_items || [];
    
    // Strict Rule: Exclude Agent ID '000', '0', and name 'wazuh.manager'
    const filtered = rawItems.filter((agent) => {
      const idStr = String(agent.id || '').trim();
      const nameStr = String(agent.name || '').trim().toLowerCase();
      return idStr !== '000' && idStr !== '0' && Number(idStr) !== 0 && nameStr !== 'wazuh.manager';
    });

    cachedAgents = { data: filtered, timestamp: now };
    return filtered;
  } catch (error: any) {
    console.error('[Wazuh API] fetchWazuhAgents error:', error.message);
    throw error;
  }
}

/**
 * Fetch agent summary from Wazuh Server API (GET /agents/summary).
 */
export async function fetchWazuhAgentSummary(forceRefresh = false): Promise<WazuhAgentSummary> {
  const now = Date.now();
  if (!forceRefresh && cachedSummary && now - cachedSummary.timestamp < CACHE_TTL_MS) {
    return cachedSummary.data;
  }

  try {
    let token = await getWazuhToken();
    let response = await wazuhFetch('/agents/summary', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}` as string,
      },
    });

    if (response.status === 401) {
      token = await getWazuhToken(true);
      response = await wazuhFetch('/agents/summary', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` as string },
      });
    }

    if (!response.ok) {
      throw new Error(`Failed GET /agents/summary (${response.status}): ${response.statusText}`);
    }

    const json = await response.json();
    const summary = json.data || {};
    cachedSummary = { data: summary, timestamp: now };
    return summary;
  } catch (error: any) {
    console.error('[Wazuh API] fetchWazuhAgentSummary error:', error.message);
    throw error;
  }
}

/**
 * Fetch hardware specifications for a specific agent from Wazuh API (GET /syscollector/{agent_id}/hardware).
 */
export async function fetchAgentHardware(agentId: string): Promise<WazuhHardwareInfo> {
  try {
    const token = await getWazuhToken();
    const response = await wazuhFetch(`/syscollector/${agentId}/hardware`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}` as string,
      },
    });

    if (!response.ok) {
      return { cpuName: 'N/A', cores: 'N/A', ramTotal: 'N/A' };
    }

    const json = await response.json();
    const item = json.data?.affected_items?.[0] || {};
    
    const cpuName = item.cpu?.name || item.board_name || 'N/A';
    const cores = item.cpu?.cores || item.cpu?.count || 'N/A';
    
    // RAM calculation (bytes or KB to GB)
    let ramTotal = 'N/A';
    const ramRaw = item.ram?.total || item.ram_total;
    if (ramRaw) {
      const numBytes = Number(ramRaw);
      if (!isNaN(numBytes) && numBytes > 0) {
        if (numBytes > 100000000) {
          const gb = (numBytes / (1024 * 1024 * 1024)).toFixed(1);
          ramTotal = `${gb} GB`;
        } else if (numBytes > 100000) {
          const gb = (numBytes / (1024 * 1024)).toFixed(1);
          ramTotal = `${gb} GB`;
        } else {
          ramTotal = `${numBytes} GB`;
        }
      } else {
        ramTotal = String(ramRaw);
      }
    }

    return {
      cpuName,
      cores,
      ramTotal,
      cpuMhz: item.cpu?.mhz,
    };
  } catch (error: any) {
    console.warn(`[Wazuh API] syscollector hardware fetch error for agent ${agentId}:`, error.message);
    return { cpuName: 'N/A', cores: 'N/A', ramTotal: 'N/A' };
  }
}
