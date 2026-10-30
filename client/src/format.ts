const TZ = "Asia/Dhaka";

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });

export const formatTaka = (n: number) => `৳${n.toLocaleString("en-IN")}`; // ৳1,20,000
export const formatTime = (iso: string) => timeFmt.format(new Date(iso)); // "2:00 PM"
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso)); // "Sat, Nov 7, 2:00 PM"
export const dayLabel = (dateStr: string) => dayFmt.format(new Date(`${dateStr}T00:00:00Z`)); // "Sat, Nov 7"

// The next 14 Dhaka calendar dates as "YYYY-MM-DD"
export function next14Days(): string[] {
  const todayDhaka = new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 10);
  const [y = 0, m = 1, d = 1] = todayDhaka.split("-").map(Number);
  return Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

// 540 ↔ "09:00" for <input type="time">
export const minutesToHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export function hhmmToMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
