/**
 * Comprehensive timezone list using IANA timezone database identifiers.
 * Offsets are computed dynamically to handle DST correctly.
 * Sorted roughly east-to-west.
 */
export const TIMEZONE_LIST = [
  // Pacific / Oceania
  { value: 'Pacific/Auckland', label: 'Auckland' },
  { value: 'Pacific/Fiji', label: 'Fiji' },
  // Australia
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Australia/Melbourne', label: 'Melbourne' },
  { value: 'Australia/Brisbane', label: 'Brisbane' },
  { value: 'Australia/Adelaide', label: 'Adelaide' },
  { value: 'Australia/Perth', label: 'Perth' },
  // East Asia
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Seoul', label: 'Seoul' },
  { value: 'Asia/Shanghai', label: 'Shanghai / Beijing' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Manila', label: 'Manila' },
  { value: 'Asia/Bangkok', label: 'Bangkok' },
  { value: 'Asia/Jakarta', label: 'Jakarta' },
  // South Asia
  { value: 'Asia/Kolkata', label: 'India (Kolkata)' },
  { value: 'Asia/Karachi', label: 'Karachi' },
  // Middle East / Gulf
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Riyadh', label: 'Riyadh' },
  { value: 'Asia/Qatar', label: 'Doha' },
  { value: 'Asia/Tehran', label: 'Tehran' },
  { value: 'Asia/Baghdad', label: 'Baghdad' },
  // Eastern Europe / Russia
  { value: 'Europe/Moscow', label: 'Moscow' },
  { value: 'Europe/Istanbul', label: 'Istanbul' },
  { value: 'Europe/Kiev', label: 'Kyiv' },
  { value: 'Europe/Bucharest', label: 'Bucharest' },
  { value: 'Europe/Athens', label: 'Athens' },
  { value: 'Europe/Helsinki', label: 'Helsinki' },
  // Central Europe (CET / CEST)
  { value: 'Europe/Zagreb', label: 'Zagreb' },
  { value: 'Europe/Belgrade', label: 'Belgrade' },
  { value: 'Europe/Sarajevo', label: 'Sarajevo' },
  { value: 'Europe/Ljubljana', label: 'Ljubljana' },
  { value: 'Europe/Podgorica', label: 'Podgorica' },
  { value: 'Europe/Skopje', label: 'Skopje' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Vienna', label: 'Vienna' },
  { value: 'Europe/Paris', label: 'Paris' },
  { value: 'Europe/Rome', label: 'Rome' },
  { value: 'Europe/Madrid', label: 'Madrid' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam' },
  { value: 'Europe/Brussels', label: 'Brussels' },
  { value: 'Europe/Zurich', label: 'Zürich' },
  { value: 'Europe/Prague', label: 'Prague' },
  { value: 'Europe/Warsaw', label: 'Warsaw' },
  { value: 'Europe/Budapest', label: 'Budapest' },
  { value: 'Europe/Copenhagen', label: 'Copenhagen' },
  { value: 'Europe/Stockholm', label: 'Stockholm' },
  { value: 'Europe/Oslo', label: 'Oslo' },
  // Western Europe / UK
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Dublin', label: 'Dublin' },
  { value: 'Europe/Lisbon', label: 'Lisbon' },
  { value: 'Atlantic/Reykjavik', label: 'Reykjavik' },
  // Africa
  { value: 'Africa/Cairo', label: 'Cairo' },
  { value: 'Africa/Lagos', label: 'Lagos' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg' },
  { value: 'Africa/Nairobi', label: 'Nairobi' },
  { value: 'Africa/Casablanca', label: 'Casablanca' },
  // Americas
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
  { value: 'America/Bogota', label: 'Bogotá' },
  { value: 'America/Lima', label: 'Lima' },
  { value: 'America/Santiago', label: 'Santiago' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'America/Toronto', label: 'Toronto' },
  { value: 'America/Chicago', label: 'Chicago (CT)' },
  { value: 'America/Denver', label: 'Denver (MT)' },
  { value: 'America/Phoenix', label: 'Phoenix (no DST)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { value: 'America/Vancouver', label: 'Vancouver' },
  { value: 'America/Mexico_City', label: 'Mexico City' },
  { value: 'America/Anchorage', label: 'Anchorage' },
  { value: 'Pacific/Honolulu', label: 'Honolulu' },
];

/**
 * Get the CURRENT UTC offset for a timezone (DST-aware).
 * Returns e.g. "+1", "-5", "+5:30", "+0"
 */
export function getCurrentOffset(tz) {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = now.toLocaleString('en-US', { timeZone: tz });
    const utcDate = new Date(utcStr);
    const tzDate = new Date(tzStr);
    const diffMs = tzDate - utcDate;
    const diffMin = Math.round(diffMs / 60000);
    const hours = Math.trunc(diffMin / 60);
    const mins = Math.abs(diffMin % 60);
    const sign = hours >= 0 ? '+' : '';
    return mins ? `${sign}${hours}:${String(mins).padStart(2, '0')}` : `${sign}${hours}`;
  } catch {
    return '';
  }
}

/**
 * Format a timezone label like "Zagreb (UTC+2)" — always DST-aware.
 */
export function formatTZLabel(tz) {
  const entry = TIMEZONE_LIST.find(t => t.value === tz);
  const offset = getCurrentOffset(tz);
  const label = entry ? entry.label : (tz?.replace(/_/g, ' ') || 'Not set');
  const offsetStr = offset === '+0' || offset === '0' ? '±0' : offset;
  return `${label} (UTC${offsetStr})`;
}
