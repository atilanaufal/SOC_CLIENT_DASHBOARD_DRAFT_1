/**
 * Formats timestamps and calculates relative "Time Ago"
 * for table list views across all pages.
 */

const MONTHS_INDEX: Record<string, number> = {
  jan: 0, januari: 0, january: 0,
  feb: 1, peb: 1, februari: 1, february: 1,
  mar: 2, maret: 2, march: 2,
  apr: 3, april: 3,
  mei: 4, may: 4,
  jun: 5, juni: 5, june: 5,
  jul: 6, juli: 6, july: 6,
  agu: 7, agt: 7, aug: 7, agustus: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  okt: 9, oct: 9, oktober: 9, october: 9,
  nop: 10, nov: 10, nopember: 10, november: 10,
  des: 11, dec: 11, desember: 11, december: 11,
};

export function parseCustomDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return new Date(val.getUTCFullYear(), val.getUTCMonth(), val.getUTCDate(), val.getUTCHours(), val.getUTCMinutes(), val.getUTCSeconds(), val.getUTCMilliseconds());
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof val === 'string') {
    let normalized = val.trim();
    if (!normalized || normalized === 'N/A' || normalized === '-') return null;

    // Remove any trailing (X days ago) relative parenthesized strings
    if (normalized.includes('(')) {
      normalized = normalized.split('(')[0].trim();
    }

    // Handle ISO date string (with or without Z) from MongoDB ISODate
    // Interprets the date & time digits directly as local time to prevent double timezone shifts (+7 hours)
    const localIsoMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:Z|[+-]\d{2}:?\d{2})?$/);
    if (localIsoMatch) {
      const datePart = localIsoMatch[1];
      const timePart = localIsoMatch[2];
      const parts = datePart.split('-').map(Number);
      const tParts = timePart.split(':');
      const hour = parseInt(tParts[0], 10);
      const min = parseInt(tParts[1], 10);
      const secParts = tParts[2].split('.');
      const sec = parseInt(secParts[0], 10);
      const ms = secParts[1] ? parseInt(secParts[1].slice(0, 3).padEnd(3, '0'), 10) : 0;
      const d = new Date(parts[0], parts[1] - 1, parts[2], hour, min, sec, ms);
      if (!isNaN(d.getTime())) return d;
    }

    // Try standard ISO or RFC parse first if it looks like standard ISO string
    if (normalized.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(normalized)) {
      const d = new Date(normalized);
      if (!isNaN(d.getTime())) return d;
    }

    // Handle Indonesian & English formatted date strings: e.g. "9 Agu 2026 16:57" or "09-Aug-2026 16:57:00"
    const pattern = /^(\d{1,2})[\s\-\/]+([A-Za-z]+)[\s\-\/]+(\d{4})(?:[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
    const match = normalized.match(pattern);
    if (match) {
      const day = parseInt(match[1], 10);
      const monthKey = match[2].toLowerCase();
      const year = parseInt(match[3], 10);
      const hour = match[4] ? parseInt(match[4], 10) : 0;
      const min = match[5] ? parseInt(match[5], 10) : 0;
      const sec = match[6] ? parseInt(match[6], 10) : 0;

      const month = MONTHS_INDEX[monthKey];
      if (month !== undefined) {
        const constructed = new Date(year, month, day, hour, min, sec);
        if (!isNaN(constructed.getTime())) return constructed;
      }
    }

    // Fallback general Date parsing with English month replacement
    let engNormalized = normalized;
    for (const [indoKey, monthNum] of Object.entries(MONTHS_INDEX)) {
      const engName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][monthNum];
      engNormalized = engNormalized.replace(new RegExp(`\\b${indoKey}\\b`, 'gi'), engName);
    }
    const fallbackDate = new Date(engNormalized);
    if (!isNaN(fallbackDate.getTime())) return fallbackDate;
  }

  return null;
}

export function getTimestamp(val: any): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const parsed = parseCustomDate(val);
  return parsed ? parsed.getTime() : 0;
}

export function formatDateTimeAndAgo(rawDate: any): { dateTime: string; timeAgo: string } {
  if (!rawDate) return { dateTime: '-', timeAgo: '' };

  let rawStr = String(rawDate).trim();
  let cleanDateStr = rawStr;
  let customAgo = '';

  if (rawStr.includes('(')) {
    const parts = rawStr.split('(');
    cleanDateStr = parts[0].trim();
    customAgo = parts[1].replace(')', '').trim();
  }

  const d = parseCustomDate(cleanDateStr);

  let timeAgo = '';
  if (customAgo) {
    timeAgo = customAgo.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  } else if (d) {
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs >= 0) {
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHours = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHours / 24);
      const diffMonths = Math.floor(diffDays / 30);
      const diffYears = Math.floor(diffDays / 365);

      if (diffSec < 60) timeAgo = 'Just Now';
      else if (diffMin < 60) timeAgo = `${diffMin} Min${diffMin > 1 ? 's' : ''} Ago`;
      else if (diffHours < 24) timeAgo = `${diffHours} Hour${diffHours > 1 ? 's' : ''} Ago`;
      else if (diffDays < 30) timeAgo = `${diffDays} Day${diffDays > 1 ? 's' : ''} Ago`;
      else if (diffMonths < 12) timeAgo = `${diffMonths} Month${diffMonths > 1 ? 's' : ''} Ago`;
      else timeAgo = `${diffYears} Year${diffYears > 1 ? 's' : ''} Ago`;
    } else {
      timeAgo = 'Just Now';
    }
  }

  // Format dateTime as readable date: e.g. "5 Sep 2026 13:48"
  let formattedDateTime = cleanDateStr;
  if (d) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dateStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    formattedDateTime = `${dateStr} ${timeStr}`;
  }

  return {
    dateTime: formattedDateTime,
    timeAgo: timeAgo,
  };
}

/**
 * Format numbers as plain clean numbers without any dot or comma separators
 * e.g. 1795 -> "1795", 18138 -> "18138"
 */
export function formatNumber(val: number | string | undefined | null): string {
  if (val === undefined || val === null || val === '') return '0';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? String(val) : String(Math.round(val));
  }
  const cleanStr = String(val).replace(/[,.]/g, '').trim();
  const num = Number(cleanStr);
  return isNaN(num) ? String(val) : String(Math.round(num));
}

/**
 * Formats arbitrary date into standard clean string: "9 Mar 2026 13:45"
 */
export function formatStandardDate(val: any): string {
  if (!val) return 'N/A';
  const d = parseCustomDate(val);
  if (!d) return String(val);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${dateStr} ${timeStr}`;
}

