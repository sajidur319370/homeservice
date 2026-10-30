import { isPgError, query, queryOne, withTransaction } from "../db/client.ts";
import { HttpError } from "../lib/http.ts";
import type { BookingStatus } from "../types.ts";

type NewReview = { customerId: string; bookingId: string; rating: number; comment?: string | undefined };

export async function createReview({ customerId, bookingId, rating, comment }: NewReview) {
  try {
    return await withTransaction(async (tx) => {
      const booking = await queryOne<{ providerId: string; customerId: string; status: BookingStatus }>(
        `SELECT provider_id AS "providerId", customer_id AS "customerId", status FROM bookings WHERE id = $1`,
        [bookingId],
        tx,
      );
      if (!booking || booking.customerId !== customerId) throw new HttpError(404, "Booking not found");
      if (booking.status !== "COMPLETED") throw new HttpError(400, "You can only review completed jobs");

      // UNIQUE (booking_id) → a second review fails with 23505 (caught below).
      const review = await queryOne(
        `INSERT INTO reviews (booking_id, provider_id, customer_id, rating, comment)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, rating, comment, created_at AS "createdAt"`,
        [bookingId, booking.providerId, customerId, rating, comment ?? null],
        tx,
      );

      // Keep sum + count (whole numbers) instead of a running float average:
      // no rounding drift, and the average is just sum / count.
      await query(
        "UPDATE provider_profiles SET rating_sum = rating_sum + $2, rating_count = rating_count + 1 WHERE user_id = $1",
        [booking.providerId, rating],
        tx,
      );
      return review;
    });
  } catch (err) {
    if (isPgError(err, "23505")) throw new HttpError(409, "You already reviewed this booking");
    throw err;
  }
}
