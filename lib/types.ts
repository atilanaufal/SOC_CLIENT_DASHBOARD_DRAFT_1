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
}

export interface Incident {
  id: string;
  _id?: string;
  sample_id?: string;
  incidentName: string;
  incident_type?: string | string[];
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | string;
  agent: string;
  agentsList?: string[];
  host: string;
  agent_id?: string;
  firstObserved: string;
  first_observed?: string;
  lastObserved?: string;
  last_observed?: string;
  date?: string;
  description: string;
  mitre: string;
  mitre_id?: string;
  mitre_tactic?: string | string[];
  mitre_technique?: string | string[];
  ruleId?: string;
  rule_id?: string;
  rule_level?: number;
  university?: string;
  tenant?: string;
  impact?: string[];
  sourceIp?: string;
  agent_ip?: string;
  ip_source?: string;
  destIp?: string;
  ip_destination?: string;
  affected_file?: string;
  count?: number;
  full_logs?: string;
  full_log?: any;
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
  status: 'Solved' | 'Not Patched' | 'Patched' | 'Active' | string;
  currentVersion?: string;
  version?: string;
  package_version?: string;
  description?: string;
  rationale?: string;
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
  affectedDevices?: { hostname?: string; agent?: string; ipAddress?: string; ip?: string; os?: string }[];
  ioc?: { mitre: string; sourceIp: string; targetUser: string };
  findings?: string[];
  recommendedAction: string;
  recommended_action?: string;
}
