import { addMinutes, dhakaToUtc } from "./time.ts";

export type TimeRange = { startAt: Date; endAt: Date };
export type WorkWindow = { startMin: number; endMin: number };

// Two ranges overlap when A starts before B ends AND A ends after B starts.
// Touching ranges (10:00–11:00 and 11:00–12:00) do NOT overlap.
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.startAt.getTime() < b.endAt.getTime() && a.endAt.getTime() > b.startAt.getTime();
}

type FreeSlotsInput = {
  dateStr: string;            // "2026-11-01", a Dhaka calendar date
  window: WorkWindow | null;  // null = day off
  durationMin: number;        // length of the service
  bookings: TimeRange[];      // bookings that block time
  now: Date;                  // passed in, so tests control the clock
  stepMin?: number;
};

/** PURE function: no database, no clock. Returns free start times in UTC. */
export function getFreeSlots({ dateStr, window, durationMin, bookings, now, stepMin = 30 }: FreeSlotsInput): Date[] {
  if (!window) return [];

  const free: Date[] = [];
  for (let m = window.startMin; m + durationMin <= window.endMin; m += stepMin) {
    const startAt = dhakaToUtc(dateStr, m);
    const slot = { startAt, endAt: addMinutes(startAt, durationMin) };

    if (startAt.getTime() <= now.getTime()) continue; // in the past
    if (bookings.some((b) => overlaps(slot, b))) continue; // taken

    free.push(startAt);
  }
  return free;
}
