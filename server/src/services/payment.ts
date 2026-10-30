import { randomBytes } from "node:crypto";
import { env } from "../config/env.ts";
import { query, queryOne, withTransaction } from "../db/client.ts";
import { BLOCKING_SQL, HOLD_ACTIVE_SQL } from "../db/fragments.ts";
import { HttpError } from "../lib/http.ts";
import type { BookingStatus, PaymentStatus } from "../types.ts";
import { createSession } from "./sslcommerz.ts";

export type PaymentResult = "success" | "refund";

export type BookingForPayment = {
  id: string;
  price: number;
  address: string;
  status: BookingStatus;
  holdActive: boolean;
  serviceTitle: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
};

// Returns { url } for the browser to go to next.
export async function initPayment(bookingId: string, customerId: string): Promise<{ url: string }> {
  const booking = await queryOne<BookingForPayment>(
    `SELECT b.id, b.price, b.address, b.status, ${HOLD_ACTIVE_SQL} AS "holdActive",
            s.title AS "serviceTitle", u.name AS "customerName", u.email AS "customerEmail", u.phone AS "customerPhone"
     FROM bookings b
     JOIN services s ON s.id = b.service_id
     JOIN users u    ON u.id = b.customer_id
     WHERE b.id = $1 AND b.customer_id = $2`,
    [bookingId, customerId],
  );
  if (!booking) throw new HttpError(404, "Booking not found");
  if (booking.status !== "PENDING_PAYMENT") throw new HttpError(400, "This booking doesn't need payment");
  if (!booking.holdActive) throw new HttpError(410, "Your 15-minute hold expired. Please book again.");

  // A new unique transaction id for every attempt, e.g. "HS-1730000000000-a1b2c3"
  const tranId = `HS-${Date.now()}-${randomBytes(3).toString("hex")}`;

  // One payment row per booking: create it, or reset it for a retry. Never touch a PAID one.
  const saved = await query(
    `INSERT INTO payments (booking_id, tran_id, amount) VALUES ($1, $2, $3)
     ON CONFLICT (booking_id) DO UPDATE
       SET tran_id = EXCLUDED.tran_id, amount = EXCLUDED.amount, status = 'INITIATED'
       WHERE payments.status <> 'PAID'
     RETURNING id`,
    [booking.id, tranId, booking.price],
  );
  if (saved.length === 0) throw new HttpError(400, "This booking is already paid");

  if (env.PAYMENT_MODE === "mock") {
    const result = await confirmPayment({ tranId, amount: booking.price, currency: "BDT", valId: "MOCK" });
    return { url: `${env.APP_URL}/payment/${result}` };
  }
  return { url: await createSession(booking, tranId) };
}

type VerifiedPayment = { tranId: string; amount: number; currency: string; valId: string };

/**
 * Confirms a VERIFIED payment. Safe to call many times (idempotent):
 * the browser redirect and the IPN may both arrive, in any order.
 * Lock order everywhere is provider → booking → payment, so two transactions never deadlock.
 */
export async function confirmPayment(v: VerifiedPayment): Promise<PaymentResult> {
  return withTransaction(async (tx) => {
    type PaymentRow = { id: string; bookingId: string; providerId: string; amount: number; status: PaymentStatus; refundRequired: boolean };
    const findPayment = () =>
      queryOne<PaymentRow>(
        `SELECT pay.id, pay.booking_id AS "bookingId", b.provider_id AS "providerId",
                pay.amount, pay.status, pay.refund_required AS "refundRequired"
         FROM payments pay JOIN bookings b ON b.id = pay.booking_id
         WHERE pay.tran_id = $1`,
        [v.tranId],
        tx,
      );

    const payment = await findPayment();
    if (!payment) throw new HttpError(404, "Payment not found");
    if (payment.status === "PAID") return payment.refundRequired ? "refund" : "success"; // already handled
    if (v.amount !== payment.amount || v.currency !== "BDT") throw new HttpError(400, "Amount or currency mismatch");

    // Same lock as booking creation: nobody can book this provider while we decide.
    await query("SELECT 1 FROM provider_profiles WHERE user_id = $1 FOR UPDATE", [payment.providerId], tx);
    const booking = await queryOne<{ status: BookingStatus; startAt: Date; endAt: Date }>(
      `SELECT status, start_at AS "startAt", end_at AS "endAt" FROM bookings WHERE id = $1 FOR UPDATE`,
      [payment.bookingId],
      tx,
    );

    // Claim the payment. Only ONE concurrent call can flip it to PAID.
    const claimed = await query(
      "UPDATE payments SET status = 'PAID', val_id = $2 WHERE id = $1 AND status <> 'PAID' RETURNING id",
      [payment.id, v.valId],
      tx,
    );
    if (claimed.length === 0) {
      const again = await findPayment(); // another call confirmed it while we waited for the lock
      return again?.refundRequired ? "refund" : "success";
    }

    // Edge case (BR-6): the hold expired and someone else took the slot meanwhile,
    // or the customer cancelled before paying. Money arrived anyway → refund it.
    const takenByOther = await queryOne(
      `SELECT 1 FROM bookings b
       WHERE b.id <> $1 AND b.provider_id = $2 AND b.start_at < $4 AND b.end_at > $3 AND ${BLOCKING_SQL}
       LIMIT 1`,
      [payment.bookingId, payment.providerId, booking!.startAt, booking!.endAt],
      tx,
    );

    if (booking!.status !== "PENDING_PAYMENT" || takenByOther) {
      await query("UPDATE bookings SET status = 'CANCELLED' WHERE id = $1", [payment.bookingId], tx);
      await query("UPDATE payments SET refund_required = true WHERE id = $1", [payment.id], tx);
      return "refund";
    }

    await query("UPDATE bookings SET status = 'CONFIRMED' WHERE id = $1", [payment.bookingId], tx);
    return "success";
  });
}

export async function markFailed(tranId: string): Promise<void> {
  await query("UPDATE payments SET status = 'FAILED' WHERE tran_id = $1 AND status = 'INITIATED'", [tranId]);
}
