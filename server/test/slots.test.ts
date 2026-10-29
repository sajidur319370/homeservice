import assert from "node:assert/strict";
import { test } from "node:test";
import { getFreeSlots, overlaps } from "../src/lib/slots.ts";
import { dhakaToUtc, isValidDateStr, utcToDhaka, weekdayOf } from "../src/lib/time.ts";

const day = "2026-11-01"; // a Sunday
const window = { startMin: 9 * 60, endMin: 12 * 60 }; // 09:00–12:00 Dhaka
const longAgo = new Date("2026-01-01T00:00:00Z"); // "now" far in the past → nothing is skipped

// Date → "09:30" in Dhaka time, so assertions are readable
const hhmm = (date: Date) => {
  const { minutes } = utcToDhaka(date);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
};
const range = (startMin: number, endMin: number) => ({ startAt: dhakaToUtc(day, startMin), endAt: dhakaToUtc(day, endMin) });

// ── time helpers ───────────────────────────────────────────────
test("09:00 Dhaka is 03:00 UTC", () => {
  assert.equal(dhakaToUtc(day, 540).toISOString(), "2026-11-01T03:00:00.000Z");
});

test("05:00 Dhaka is the PREVIOUS day in UTC", () => {
  assert.equal(dhakaToUtc(day, 300).toISOString(), "2026-10-31T23:00:00.000Z");
});

test("utcToDhaka reverses dhakaToUtc, even across midnight UTC", () => {
  assert.deepEqual(utcToDhaka(dhakaToUtc(day, 300)), { dateStr: day, minutes: 300 });
});

test("weekdayOf: Sunday is 0, Friday is 5", () => {
  assert.equal(weekdayOf("2026-11-01"), 0);
  assert.equal(weekdayOf("2026-11-06"), 5);
});

test("isValidDateStr rejects impossible and badly formatted dates", () => {
  assert.equal(isValidDateStr("2026-11-01"), true);
  assert.equal(isValidDateStr("2026-02-30"), false);
  assert.equal(isValidDateStr("1/11/2026"), false);
});

// ── overlaps ───────────────────────────────────────────────────
test("overlapping ranges overlap", () => {
  assert.equal(overlaps(range(540, 600), range(570, 630)), true);
});

test("touching ranges do NOT overlap (10:00–11:00 and 11:00–12:00)", () => {
  assert.equal(overlaps(range(600, 660), range(660, 720)), false);
});

// ── getFreeSlots ───────────────────────────────────────────────
test("a free morning gives 30-minute steps that fit the window", () => {
  const slots = getFreeSlots({ dateStr: day, window, durationMin: 60, bookings: [], now: longAgo });
  assert.deepEqual(slots.map(hhmm), ["09:00", "09:30", "10:00", "10:30", "11:00"]);
});

test("a day off has no slots", () => {
  assert.deepEqual(getFreeSlots({ dateStr: day, window: null, durationMin: 60, bookings: [], now: longAgo }), []);
});

test("a booking at 10:00–11:00 removes every slot that touches it", () => {
  const slots = getFreeSlots({ dateStr: day, window, durationMin: 60, bookings: [range(600, 660)], now: longAgo });
  assert.deepEqual(slots.map(hhmm), ["09:00", "11:00"]);
});

test("times in the past are hidden", () => {
  const now = dhakaToUtc(day, 600); // 10:00
  const slots = getFreeSlots({ dateStr: day, window, durationMin: 60, bookings: [], now });
  assert.deepEqual(slots.map(hhmm), ["10:30", "11:00"]);
});

test("a 90-minute service must end before the window closes", () => {
  const slots = getFreeSlots({ dateStr: day, window, durationMin: 90, bookings: [], now: longAgo });
  assert.deepEqual(slots.map(hhmm), ["09:00", "09:30", "10:00", "10:30"]);
});
