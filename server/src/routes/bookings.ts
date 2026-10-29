import { Router } from "express";
import { z } from "zod";
import { query } from "../db/client.ts";
import { HOLD_ACTIVE_SQL } from "../db/fragments.ts";
import { HttpError, param } from "../lib/http.ts";
import { currentUser, requireAuth, requireRole } from "../middleware/auth.ts";
import { cancelBooking, createBooking } from "../services/booking.ts";

const router = Router();

const createSchema = z.object({
  serviceId: z.uuid(),
  startAt: z.coerce.date(), // "2026-11-07T04:00:00.000Z" → Date
  address: z.string().trim().min(5, "Please enter your full address").max(200),
});

// ── CUSTOMER: create ───────────────────────────────────────────
router.post("/", requireAuth, requireRole("CUSTOMER"), async (req, res) => {
  const input = createSchema.parse(req.body);
  const booking = await createBooking({ customerId: currentUser(req).id, ...input });
  res.status(201).json({ booking });
});

// ── CUSTOMER or PROVIDER: my bookings ──────────────────────────
router.get("/me", requireAuth, requireRole("CUSTOMER", "PROVIDER"), async (req, res) => {
  const user = currentUser(req);
  // A fixed column name chosen by role (never user input), so it is safe in the SQL text.
  const mine = user.role === "CUSTOMER" ? "b.customer_id" : "b.provider_id";

  // One query with JOINs instead of 1 + N small ones (no N+1 problem).
  const bookings = await query(
    `SELECT b.id, b.status, b.start_at AS "startAt", b.end_at AS "endAt", b.price, b.address,
            b.created_at AS "createdAt", ${HOLD_ACTIVE_SQL} AS "holdActive",
            s.title AS "serviceTitle", s.id AS "serviceId",
            cu.name AS "customerName", cu.phone AS "customerPhone",
            pu.name AS "providerName", pu.phone AS "providerPhone",
            pay.status AS "paymentStatus", coalesce(pay.refund_required, false) AS "refundRequired",
            r.rating AS "reviewRating"
     FROM bookings b
     JOIN services s  ON s.id = b.service_id
     JOIN users cu    ON cu.id = b.customer_id
     JOIN users pu    ON pu.id = b.provider_id
     LEFT JOIN payments pay ON pay.booking_id = b.id
     LEFT JOIN reviews r    ON r.booking_id = b.id
     WHERE ${mine} = $1
     ORDER BY b.start_at DESC
     LIMIT 100`,
    [user.id],
  );
  res.json({ bookings });
});

// ── CUSTOMER: cancel a future booking ──────────────────────────
router.patch("/:id/cancel", requireAuth, requireRole("CUSTOMER"), async (req, res) => {
  const result = await cancelBooking(param(req, "id"), currentUser(req).id);
  res.json({ ok: true, ...result });
});

// ── PROVIDER: mark a started, confirmed job as completed (BR-7) ─
router.patch("/:id/complete", requireAuth, requireRole("PROVIDER"), async (req, res) => {
  const done = await query(
    `UPDATE bookings SET status = 'COMPLETED'
     WHERE id = $1 AND provider_id = $2 AND status = 'CONFIRMED' AND start_at <= now()
     RETURNING id`,
    [req.params.id, currentUser(req).id],
  );
  if (done.length === 0) throw new HttpError(400, "Only a confirmed booking that has started can be completed");
  res.json({ ok: true });
});

export default router;
