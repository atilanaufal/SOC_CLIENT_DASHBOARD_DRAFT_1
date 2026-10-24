/**
 * Utility functions for calculating Risk Score and Risk Categories
 * based on Project_Document/Risk Score Formula.pdf
 */

export interface RiskCategory {
  key: 'low' | 'moderate' | 'elevated' | 'high' | 'critical';
  label: string;
  range: string;
  minScore: number;
  maxScore: number;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  badgeBg: string;
  badgeText: string;
  meaning: string;
}

export const RISK_CATEGORIES: RiskCategory[] = [
  {
    key: 'low',
    label: 'Low',
    range: '0-20',
    minScore: 0,
    maxScore: 20,
    color: '#22C55E',
    bgClass: 'bg-[#22C55E]',
    textClass: 'text-white',
    borderClass: 'border-emerald-600',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-600',
    meaning: 'Normal security activity',
  },
  {
    key: 'moderate',
    label: 'Moderate',
    range: '21-40',
    minScore: 21,
    maxScore: 40,
    color: '#EAB308',
    bgClass: 'bg-[#EAB308]',
    textClass: 'text-white',
    borderClass: 'border-yellow-500',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-600',
    meaning: 'Increased attention',
  },
  {
    key: 'elevated',
    label: 'Elevated',
    range: '41-60',
    minScore: 41,
    maxScore: 60,
    color: '#F97316',
    bgClass: 'bg-[#F97316]',
    textClass: 'text-white',
    borderClass: 'border-orange-600',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-600',
    meaning: 'Investigation recommended',
  },
  {
    key: 'high',
    label: 'High',
    range: '61-80',
    minScore: 61,
    maxScore: 80,
    color: '#EF4444',
    bgClass: 'bg-[#EF4444]',
    textClass: 'text-white',
    borderClass: 'border-red-600',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-600',
    meaning: 'Immediate investigation',
  },
  {
    key: 'critical',
    label: 'Critical',
    range: '81-100',
    minScore: 81,
    maxScore: 100,
    color: '#991B1B',
    bgClass: 'bg-[#991B1B]',
    textClass: 'text-white',
    borderClass: 'border-rose-900',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-800',
    meaning: 'Incident response required',
  },
];

/**
 * Severity weight lookup based on Wazuh rule.level (0-15)
 * - 12–15: Critical -> Weight 6
 * - 8–11: High -> Weight 3
 * - 4–7: Medium -> Weight 1
 * - 0–3: Low / Info -> Weight 0 (no low in breakdown)
 */
export function getSeverityWeight(val: any): number {
  if (val === null || val === undefined) return 0;

  if (typeof val === 'number' || (!isNaN(Number(val)) && String(val).trim() !== '')) {
    const num = Number(val);
    if (num >= 12) return 6;
    if (num >= 8) return 3;
    if (num >= 4) return 1;
    return 0;
  }

  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (lower === 'critical') return 6;
    if (lower === 'high') return 3;
    if (lower === 'medium') return 1;
    return 0;
  }

  return 0;
}

/**
 * Get Risk Category object for a given score (0-100)
 */
export function getRiskCategory(score: number): RiskCategory {
  const clamped = Math.min(Math.max(Math.round(score), 0), 100);
  if (clamped <= 20) return RISK_CATEGORIES[0];
  if (clamped <= 40) return RISK_CATEGORIES[1];
  if (clamped <= 60) return RISK_CATEGORIES[2];
  if (clamped <= 80) return RISK_CATEGORIES[3];
  return RISK_CATEGORIES[4];
}

export interface AgentScoreResult {
  agent: string;
  cappedScore: number;
  rawScore: number;
  alertCount: number;
  riskCategory: RiskCategory;
}

/**
 * Calculate Agent Score (AS) per agent:
 * AS(e) = min(100, (Critical * 6) + (High * 3) + (Medium * 1))
 */
export function calculateAgentScores(incidents: any[]): AgentScoreResult[] {
  const agentMap = new Map<string, { rawScore: number; alertCount: number }>();

  incidents.forEach((inc) => {
    const agentId = inc.agent_id || inc.agent || inc.host || 'Unknown Agent';
    const weight = getSeverityWeight(inc.severity ?? inc.rule_level);
    const count = typeof inc.count === 'number' && inc.count > 0 ? inc.count : 1;
    const addedScore = weight * count;

    if (!agentMap.has(agentId)) {
      agentMap.set(agentId, { rawScore: addedScore, alertCount: count });
    } else {
      const item = agentMap.get(agentId)!;
      item.rawScore += addedScore;
      item.alertCount += count;
    }
  });

  return Array.from(agentMap.entries()).map(([agent, data]) => {
    const cappedScore = Math.min(100, data.rawScore);
    return {
      agent,
      cappedScore,
      rawScore: data.rawScore,
      alertCount: data.alertCount,
      riskCategory: getRiskCategory(cappedScore),
    };
  }).sort((a, b) => b.cappedScore - a.cappedScore);
}

/**
 * Calculate Overall Composite Risk Score (CRS):
 * RiskScore = (\sum AS_i) / Total Online Agents
 */
export function calculateOverallRiskScore(agentScores: AgentScoreResult[], totalOnlineAgents?: number): number {
  if (!agentScores || agentScores.length === 0) return 0;

  const totalScore = agentScores.reduce((sum, item) => sum + item.cappedScore, 0);
  const agentCount = (totalOnlineAgents && totalOnlineAgents > 0) ? totalOnlineAgents : agentScores.length;

  return Number((totalScore / agentCount).toFixed(1));
}
