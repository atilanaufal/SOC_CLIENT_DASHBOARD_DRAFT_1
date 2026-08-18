export interface Device {
  id: string;
  agent: string;
  os: string;
  status: 'Online' | 'Offline';
  lastSeen: string;
  cpu?: string;
  cores?: string;
  ram?: string;
  university?: string;
  tenant?: string;
  agentVersion?: string;
  ipAddress?: string;
  detectedIssues?: string[];
  risk?: string;
  score?: number; // 0-100
  riskCategory?: string; // Low, Moderate, Elevated, High, Critical
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  missingPatches?: string;
  protection?: 'Protected' | 'Not Protected';
}

export interface Incident {
  id: string;
  _id?: string;
  incidentName: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | string;
  agent: string;
  agentsList?: string[];
  host: string;
  firstObserved: string;
  lastObserved?: string;
  description: string;
  mitre: string;
  mitre_id?: string;
  mitre_tactic?: string | string[];
  mitre_technique?: string | string[];
  ruleId?: string;
  rule_id?: string;
  university?: string;
  tenant?: string;
  impact?: string[];
  recommendedActions?: string[];
  sourceIp?: string;
  agent_ip?: string;
  ip_source?: string;
  destIp?: string;
  ip_destination?: string;
  affected_file?: string;
  count?: number;
  timeObserved?: string;
  full_logs?: string;
}

export interface Vulnerability {
  id: string;
  _id?: string;
  name: string;
  vulnerability?: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | string;
  agent: string;
  cveId: string;
  cve?: string;
  detectionDate: string;
  detected_at?: string;
  status: 'Patched' | 'Not Patched' | 'Active' | string;
  currentVersion?: string;
  version?: string;
  description?: string;
  impact?: string;
  category?: string;
  hostname?: string;
  classification?: string;
  package?: string;
  ip?: string;
}

export interface SecurityReport {
  id: string;
  _id?: string;
  reportName: string;
  report_name?: string;
  report_id?: number;
  report_uuid?: string;
  soc_id?: string;
  type?: string;
  dateGenerated: string;
  date_generated?: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Unspecified' | string;
  lastUpdated?: string;
  synced_at?: string;
  summary: string;
  affectedDevices?: { hostname: string; agent: string; ipAddress: string }[];
  ioc?: { mitre: string; sourceIp: string; targetUser: string };
  findings?: string[];
  recommendedAction: string;
  recommended_action?: string;
}

/**
 * Exact Device Breakdown matching user's exact table screenshot & accumulated Devices At Risk KPI
 * 1. Agent-001:   H:1, M:3        => 0*10 + 1*6 + 3*3 = 15 (Low)
 * 2. agent-01:    C:1, H:2, M:9   => 1*10 + 2*6 + 9*3 = 49 (Elevated)
 * 3. agent-02:    C:3, H:1, M:3   => 3*10 + 1*6 + 3*3 = 45 (Elevated)
 * 4. agent-03:    H:2, M:4        => 0*10 + 2*6 + 4*3 = 24 (Moderate)
 * 5. agent-04:    H:3, M:4        => 0*10 + 3*6 + 4*3 = 30 (Moderate)
 * 6. agent-05:    C:2, H:4, M:3   => 2*10 + 4*6 + 3*3 = 53 (Elevated)
 * 7. Agent-12C:   C:1, H:2, M:2   => 1*10 + 2*6 + 2*3 = 28 (Moderate)
 * 8. ASB-P12:     H:4, M:3        => 0*10 + 4*6 + 3*3 = 33 (Moderate)
 * 9. ifm-302:     H:1, M:4        => 0*10 + 1*6 + 4*3 = 18 (Low)
 * 10. Wazuh-FD1ic:C:2, H:2, M:3   => 2*10 + 2*6 + 3*3 = 41 (Elevated)
 *
 * Totals for Devices At Risk KPI: Critical = 9, High = 22, Medium = 38
 * Sum of Scores = 336 => Average Risk Score = 33.6
 */
const DEVICE_SPECS = [
  { agent: 'Agent-001', c: 0, h: 1, m: 3 },
  { agent: 'agent-01', c: 1, h: 2, m: 9 },
  { agent: 'agent-02', c: 3, h: 1, m: 3 },
  { agent: 'agent-03', c: 0, h: 2, m: 4 },
  { agent: 'agent-04', c: 0, h: 3, m: 4 },
  { agent: 'agent-05', c: 2, h: 4, m: 3 },
  { agent: 'Agent-12C', c: 1, h: 2, m: 2 },
  { agent: 'ASB-P12', c: 0, h: 4, m: 3 },
  { agent: 'ifm-302', c: 0, h: 1, m: 4 },
  { agent: 'Wazuh-FD1ic', c: 2, h: 2, m: 3 },
];

export const MOCK_DEVICES: Device[] = DEVICE_SPECS.map((spec, index) => {
  const isOnline = index % 5 !== 0;
  const osList = ['Windows 11 LTSC', 'Ubuntu 22.04 LTS', 'Fedora 39', 'Windows Server 2022', 'FreeBSD 13'];
  const isProtected = index % 3 !== 0;
  
  // Formula: Critical (10) + High (6) + Medium (3)
  const rawScore = (spec.c * 10) + (spec.h * 6) + (spec.m * 3);
  const score = Math.min(100, rawScore);

  let categoryLabel = 'Low';
  if (score > 80) categoryLabel = 'Critical';
  else if (score > 60) categoryLabel = 'High';
  else if (score > 40) categoryLabel = 'Elevated';
  else if (score > 20) categoryLabel = 'Moderate';

  return {
    id: `dev-${index + 1}`,
    agent: spec.agent,
    os: osList[index % osList.length],
    status: isOnline ? 'Online' : 'Offline',
    lastSeen: isOnline ? '28 Juli 2026 8 Hours Ago' : '25 Juli 2026 3 Days Ago',
    cpu: index % 2 === 0 ? 'Amd Ryzen 7 9800X' : 'Intel Core i9-14900K',
    cores: '12 Cores',
    ram: '128Gb',
    university: 'Swiss German University',
    tenant: 'Cyber Lab Head Office',
    agentVersion: '4.14.6',
    ipAddress: `192.168.100.${10 + index}`,
    risk: `${categoryLabel} (${score})`,
    score,
    riskCategory: categoryLabel,
    criticalCount: spec.c,
    highCount: spec.h,
    mediumCount: spec.m,
    missingPatches: `${spec.m + spec.h} Medium`,
    protection: isProtected ? 'Protected' : 'Not Protected',
    detectedIssues: [
      'Malware Detected',
      'Brute Force Attempts',
      'Missing Security Patches 5 (High)',
    ],
  };
});
