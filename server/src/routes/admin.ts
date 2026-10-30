import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../db/client.ts";
import { HttpError } from "../lib/http.ts";
import { requireAuth, requireRole } from "../middleware/auth.ts";

const router = Router();

// Every route in this file: logged in AND admin.
router.use(requireAuth, requireRole("ADMIN"));

router.get("/stats", async (_req, res) => {
  // 5 independent queries, run in parallel.
  const [usersByRole, bookingsByStatus, revenue, pending, refunds] = await Promise.all([
    query<{ role: string; count: number }>("SELECT role, count(*)::int AS count FROM users GROUP BY role"),
    query<{ status: string; count: number }>("SELECT status, count(*)::int AS count FROM bookings GROUP BY status"),
    queryOne<{ total: number }>(
      "SELECT coalesce(sum(amount), 0)::int AS total FROM payments WHERE status = 'PAID' AND NOT refund_required",
    ),
    queryOne<{ count: number }>("SELECT count(*)::int AS count FROM provider_profiles WHERE NOT approved"),
    query(
      `SELECT pay.id, pay.amount, pay.tran_id AS "tranId", pay.updated_at AS "updatedAt",
              b.id AS "bookingId", u.name AS "customerName", u.email AS "customerEmail"
       FROM payments pay
       JOIN bookings b ON b.id = pay.booking_id
       JOIN users u    ON u.id = b.customer_id
       WHERE pay.refund_required
       ORDER BY pay.updated_at DESC`,
    ),
  ]);

  res.json({
    usersByRole: Object.fromEntries(usersByRole.map((r) => [r.role, r.count])),
    bookingsByStatus: Object.fromEntries(bookingsByStatus.map((b) => [b.status, b.count])),
    revenue: revenue?.total ?? 0,
    pendingProviders: pending?.count ?? 0,
    refunds,
  });
});

router.get("/providers", async (req, res) => {
  const approved = req.query.approved === "true";
  const providers = await query(
    `SELECT p.user_id AS id, p.area, p.bio, p.approved, u.name, u.email, u.phone, u.created_at AS "createdAt",
            (SELECT count(*)::int FROM services s WHERE s.provider_id = p.user_id AND s.active) AS "serviceCount"
     FROM provider_profiles p JOIN users u ON u.id = p.user_id
     WHERE p.approved = $1
     ORDER BY u.created_at DESC`,
    [approved],
  );
  res.json({ providers });
});

router.patch("/providers/:id/approve", async (req, res) => {
  const { approved } = z.object({ approved: z.boolean() }).parse(req.body);
  const provider = await queryOne(
    "UPDATE provider_profiles SET approved = $2 WHERE user_id = $1 RETURNING user_id AS id, approved",
    [req.params.id, approved],
  );
  if (!provider) throw new HttpError(404, "Provider not found");
  res.json({ provider });
});

export default router;
