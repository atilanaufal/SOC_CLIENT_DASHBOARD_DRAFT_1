/**
 * Parses incident/vulnerability severity according to standard Wazuh Rule Level classification:
 * - Level 15 or higher (>= 15): Critical
 * - Level 12 to 14 (12..14): High
 * - Level 7 to 11 (7..11): Medium
 * - Level 1 to 6 (1..6): Low
 * - Level 0 or unspecified/invalid: Informational
 */
export function parseSeverity(val: any): string {
  if (val === null || val === undefined) return 'Informational';

  // Handle textual severities first if it's explicitly a string name
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s || s === '-' || s.toLowerCase() === 'unspecified') return 'Informational';
    const lower = s.toLowerCase();
    if (lower === 'critical') return 'Critical';
    if (lower === 'high') return 'High';
    if (lower === 'medium') return 'Medium';
    if (lower === 'low') return 'Low';
    if (lower === 'informational' || lower === 'info') return 'Informational';
  }

  // If val is a number or numeric string (e.g. 7, "7", 12, "12", 15, "15")
  const num = Number(val);
  if (!isNaN(num) && String(val).trim() !== '') {
    if (num >= 15) return 'Critical';
    if (num >= 12) return 'High';
    if (num >= 7) return 'Medium';
    if (num >= 1) return 'Low';
    return 'Informational';
  }

  const s = String(val).trim();
  if (!s || s === '-' || s.toLowerCase() === 'unspecified') return 'Informational';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
