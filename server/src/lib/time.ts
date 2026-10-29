// Dhaka is UTC+6 all year (no daylight saving), so a fixed offset is exact.
export const DHAKA_OFFSET_MIN = 6 * 60;
const MS_PER_MIN = 60_000;

function parts(dateStr: string): [number, number, number] {
  const [y = NaN, m = NaN, d = NaN] = dateStr.split("-").map(Number);
  return [y, m, d];
}

// ("2026-11-01", 540) → Date for 09:00 Dhaka = 2026-11-01T03:00:00Z
export function dhakaToUtc(dateStr: string, minutes: number): Date {
  const [y, m, d] = parts(dateStr);
  // Date.UTC handles negative minutes: 05:00 Dhaka → the previous UTC day.
  return new Date(Date.UTC(y, m - 1, d, 0, minutes - DHAKA_OFFSET_MIN));
}

// Date → { dateStr: "2026-11-01", minutes: 540 } in Dhaka time
export function utcToDhaka(date: Date): { dateStr: string; minutes: number } {
  const shifted = new Date(date.getTime() + DHAKA_OFFSET_MIN * MS_PER_MIN);
  return {
    dateStr: shifted.toISOString().slice(0, 10),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

// 0 = Sunday … 5 = Friday, 6 = Saturday (for a Dhaka calendar date)
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = parts(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MS_PER_MIN);
}

// "2026-11-01" ✔   "2026-02-30" ✘   "1/11/2026" ✘
export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = parts(s);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === s;
}
