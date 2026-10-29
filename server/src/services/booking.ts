import { query, queryOne, withTransaction } from "../db/client.ts";
import { BLOCKING_SQL } from "../db/fragments.ts";
import { HttpError } from "../lib/http.ts";
import type { WorkWindow } from "../lib/slots.ts";
import { addMinutes, utcToDhaka, weekdayOf } from "../lib/time.ts";
import type { BookingStatus } from "../types.ts";

type NewBooking = { customerId: string; serviceId: string; startAt: Date; address: string };

export type CreatedBooking = { id: string; status: BookingStatus; startAt: Date; endAt: Date; price: number };

export async function createBooking({ customerId, serviceId, startAt, address }: NewBooking) {
  // ── Checks that don't need the lock ───────────────────────────
  const service = await queryOne<{ providerId: string; price: number; durationMin: number }>(
    `SELECT s.provider_id AS "providerId", s.price, s.duration_min AS "durationMin"
     FROM services s JOIN provider_profiles p ON p.user_id = s.provider_id
     WHERE s.id = $1 AND s.active AND p.approved`,
    [serviceId],
  );
  if (!service) throw new HttpError(404, "Service not found");
  if (startAt.getTime() <= Date.now()) throw new HttpError(400, "Please pick a time in the future");
  if (service.providerId === customerId) throw new HttpError(400, "You can't book your own service");

  const endAt = addMinutes(startAt, service.durationMin);

  // BR-2: must fit inside the provider's working window for that Dhaka day.
  const { dateStr, minutes } = utcToDhaka(startAt);
  const window = await queryOne<WorkWindow>(
    `SELECT start_min AS "startMin", end_min AS "endMin"
     FROM availability WHERE provider_id = $1 AND weekday = $2`,
    [service.providerId, weekdayOf(dateStr)],
  );
  if (!window || minutes < window.startMin || minutes + service.durationMin > window.endMin) {
    throw new HttpError(400, "That time is outside the provider's working hours");
  }

  // ── The critical section ──────────────────────────────────────
  return withTransaction(async (tx) => {
    // 1. LOCK this provider's row. A second booking for the same provider WAITS here
    //    until we COMMIT, then its overlap check (step 2) sees our new booking.
    await query("SELECT 1 FROM provider_profiles WHERE user_id = $1 FOR UPDATE", [service.providerId], tx);

    // 2. CHECK for a blocking booking that overlaps [startAt, endAt)
    const clash = await queryOne(
      `SELECT 1 FROM bookings b
       WHERE b.provider_id = $1 AND b.start_at < $3 AND b.end_at > $2 AND ${BLOCKING_SQL}
       LIMIT 1`,
      [service.providerId, startAt, endAt],
      tx,
    );
    if (clash) throw new HttpError(409, "Sorry, this slot was just taken. Please pick another time.");

    // 3. INSERT: PENDING_PAYMENT holds the slot for 15 minutes (BR-4), price is a snapshot (BR-5)
    const booking = await queryOne<CreatedBooking>(
      `INSERT INTO bookings (customer_id, provider_id, service_id, start_at, end_at, price, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, status, start_at AS "startAt", end_at AS "endAt", price`,
      [customerId, service.providerId, serviceId, startAt, endAt, service.price, address],
      tx,
    );
    return booking!;
  });
}

// Customer cancels a future booking (FR-C8). Returns whether a refund is now owed.
export async function cancelBooking(bookingId: string, customerId: string) {
  return withTransaction(async (tx) => {
    // All the rules live in the WHERE, and UPDATE locks the row: two clicks can't both win.
    const cancelled = await query(
      `UPDATE bookings SET status = 'CANCELLED'
       WHERE id = $1 AND customer_id = $2
         AND status IN ('PENDING_PAYMENT', 'CONFIRMED') AND start_at > now()
       RETURNING id`,
      [bookingId, customerId],
      tx,
    );
    if (cancelled.length === 0) throw new HttpError(400, "This booking can't be cancelled");

    // Paid already? Flag it so the admin sees a refund to process.
    // A NEW statement sees a payment confirmed a moment ago (lock order: booking → payment).
    const refund = await query(
      `UPDATE payments SET refund_required = true
       WHERE booking_id = $1 AND status = 'PAID'
       RETURNING id`,
      [bookingId],
      tx,
    );
    return { refundRequired: refund.length > 0 };
  });
}
