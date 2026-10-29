import { Router } from "express";
import { z } from "zod";
import { query, queryOne, withTransaction } from "../db/client.ts";
import { BLOCKING_SQL, RATING_AVG_SQL, SERVICE_CARD_SQL } from "../db/fragments.ts";
import { HttpError } from "../lib/http.ts";
import { getFreeSlots, type TimeRange, type WorkWindow } from "../lib/slots.ts";
import { dhakaToUtc, isValidDateStr, weekdayOf } from "../lib/time.ts";
import { currentUser, requireAuth, requireRole } from "../middleware/auth.ts";

const router = Router();

// ── PROVIDER: my profile + hours. MUST be above "/:id" ─────────
router.get("/me", requireAuth, requireRole("PROVIDER"), async (req, res) => {
  const id = currentUser(req).id;
  const [profile, availability] = await Promise.all([
    queryOne("SELECT user_id AS id, area, bio, approved FROM provider_profiles WHERE user_id = $1", [id]),
    query(
      `SELECT weekday, start_min AS "startMin", end_min AS "endMin"
       FROM availability WHERE provider_id = $1 ORDER BY weekday`,
      [id],
    ),
  ]);
  if (!profile) throw new HttpError(404, "Provider profile not found");
  res.json({ profile: { ...profile, availability } });
});

const minuteOfDay = z.number().int().min(0).max(24 * 60);
const availabilitySchema = z.object({
  days: z
    .array(
      z
        .object({ weekday: z.number().int().min(0).max(6), startMin: minuteOfDay, endMin: minuteOfDay })
        .refine((d) => d.endMin > d.startMin, "End time must be after start time"),
    )
    .max(7)
    .refine((days) => new Set(days.map((d) => d.weekday)).size === days.length, "Each weekday only once"),
});

// Replace the whole week in ONE transaction: delete old rows + insert new rows.
router.put("/me/availability", requireAuth, requireRole("PROVIDER"), async (req, res) => {
  const { days } = availabilitySchema.parse(req.body);
  const providerId = currentUser(req).id;

  await withTransaction(async (tx) => {
    await query("DELETE FROM availability WHERE provider_id = $1", [providerId], tx);
    // unnest() turns 3 arrays into rows: one INSERT for the whole week.
    await query(
      `INSERT INTO availability (provider_id, weekday, start_min, end_min)
       SELECT $1, * FROM unnest($2::smallint[], $3::smallint[], $4::smallint[])`,
      [providerId, days.map((d) => d.weekday), days.map((d) => d.startMin), days.map((d) => d.endMin)],
      tx,
    );
  });
  res.json({ ok: true });
});

// ── PUBLIC: provider profile + services ────────────────────────
router.get("/:id", async (req, res) => {
  const provider = await queryOne(
    `SELECT p.user_id AS id, u.name, p.area, p.bio, ${RATING_AVG_SQL} AS "ratingAvg", p.rating_count AS "ratingCount"
     FROM provider_profiles p JOIN users u ON u.id = p.user_id
     WHERE p.user_id = $1 AND p.approved`,
    [req.params.id],
  );
  if (!provider) throw new HttpError(404, "Provider not found");
  const services = await query(`${SERVICE_CARD_SQL} WHERE s.provider_id = $1 AND s.active ORDER BY s.title`, [
    req.params.id,
  ]);
  res.json({ provider: { ...provider, services } });
});

// ── PUBLIC: free slots for one service on one day ──────────────
const slotsQuery = z.object({
  serviceId: z.uuid(),
  date: z.string().refine(isValidDateStr, "date must be YYYY-MM-DD"),
});

router.get("/:id/slots", async (req, res) => {
  const { serviceId, date } = slotsQuery.parse(req.query);
  const providerId = req.params.id;

  const service = await queryOne<{ durationMin: number }>(
    `SELECT s.duration_min AS "durationMin"
     FROM services s JOIN provider_profiles p ON p.user_id = s.provider_id
     WHERE s.id = $1 AND s.provider_id = $2 AND s.active AND p.approved`,
    [serviceId, providerId],
  );
  if (!service) throw new HttpError(404, "Service not found");

  const [window, bookings] = await Promise.all([
    // 1. Working window for that weekday (none = day off)
    queryOne<WorkWindow>(
      `SELECT start_min AS "startMin", end_min AS "endMin"
       FROM availability WHERE provider_id = $1 AND weekday = $2`,
      [providerId, weekdayOf(date)],
    ),
    // 2. Blocking bookings that touch this Dhaka day
    query<TimeRange>(
      `SELECT b.start_at AS "startAt", b.end_at AS "endAt"
       FROM bookings b
       WHERE b.provider_id = $1 AND b.start_at < $3 AND b.end_at > $2 AND ${BLOCKING_SQL}`,
      [providerId, dhakaToUtc(date, 0), dhakaToUtc(date, 24 * 60)],
    ),
  ]);

  // 3. Pure calculation (unit-tested without a database)
  const slots = getFreeSlots({
    dateStr: date,
    window: window ?? null,
    durationMin: service.durationMin,
    bookings,
    now: new Date(),
  });
  res.json({ date, slots });
});

// ── PUBLIC: reviews, newest first, 5 per page ──────────────────
router.get("/:id/reviews", async (req, res) => {
  const { page } = z.object({ page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
  const pageSize = 5;

  const [reviews, count] = await Promise.all([
    query(
      `SELECT r.id, r.rating, r.comment, r.created_at AS "createdAt", u.name AS "customerName"
       FROM reviews r JOIN users u ON u.id = r.customer_id
       WHERE r.provider_id = $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, pageSize, (page - 1) * pageSize],
    ),
    queryOne<{ total: number }>("SELECT count(*)::int AS total FROM reviews WHERE provider_id = $1", [req.params.id]),
  ]);

  const total = count?.total ?? 0;
  res.json({ reviews, total, page, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
});

export default router;
