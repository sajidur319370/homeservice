import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../db/client.ts";
import { escapeLike, OPEN_SQL, SERVICE_CARD_SQL } from "../db/fragments.ts";
import { HttpError } from "../lib/http.ts";
import { currentUser, requireAuth, requireRole } from "../middleware/auth.ts";

const router = Router();

// Each rule has its own message, so the form can say exactly what's wrong.
const serviceSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(80),
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(1000),
  categoryId: z.uuid("Choose a category"),
  price: z.coerce.number().int("Price must be a whole number").min(50, "Price must be at least ৳50").max(100_000),
  durationMin: z.coerce
    .number()
    .int()
    .refine((n) => n >= 30 && n <= 480 && n % 30 === 0, "Duration must be 30–480 minutes, in steps of 30"),
  area: z.string().trim().min(2, "Choose an area").max(40),
});

// API field name → database column. Only these columns can ever be updated.
const COLUMNS = {
  title: "title",
  description: "description",
  categoryId: "category_id",
  price: "price",
  durationMin: "duration_min",
  area: "area",
} as const;

const searchSchema = z.object({
  q: z.string().trim().max(60).optional(),
  category: z.string().trim().optional(), // category slug
  area: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12), // capped: nobody gets 1,000,000 rows
});

// ── PUBLIC: search ─────────────────────────────────────────────
router.get("/", async (req, res) => {
  const f = searchSchema.parse(req.query);

  // Build the WHERE from the filters that were sent. `$` adds a value and returns
  // its placeholder ("$1", "$2" …), so user input never becomes part of the SQL text.
  const params: unknown[] = [];
  const $ = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const where = ["s.active", "p.approved"]; // BR-9 soft delete, BR-1 approved providers only
  if (f.category) where.push(`c.slug = ${$(f.category)}`);
  if (f.area) where.push(`lower(s.area) = lower(${$(f.area)})`);
  if (f.q) where.push(`(s.title || ' ' || s.description) ILIKE ${$(`%${escapeLike(f.q)}%`)}`);
  const whereSql = where.join(" AND ");
  const filterParams = [...params];

  // Both queries at the same time instead of one after the other.
  const [services, count] = await Promise.all([
    query(
      `${SERVICE_CARD_SQL} WHERE ${whereSql}
       ORDER BY s.created_at DESC, s.id
       LIMIT ${$(f.pageSize)} OFFSET ${$((f.page - 1) * f.pageSize)}`,
      params,
    ),
    queryOne<{ total: number }>(
      `SELECT count(*)::int AS total
       FROM services s
       JOIN provider_profiles p ON p.user_id = s.provider_id
       JOIN categories c        ON c.id = s.category_id
       WHERE ${whereSql}`,
      filterParams,
    ),
  ]);

  const total = count?.total ?? 0;
  res.json({ services, total, page: f.page, totalPages: Math.max(1, Math.ceil(total / f.pageSize)) });
});

// ── PROVIDER: my services. MUST be above "/:id" ───────────────
router.get("/mine", requireAuth, requireRole("PROVIDER"), async (req, res) => {
  const services = await query(
    `SELECT s.id, s.title, s.description, s.price, s.duration_min AS "durationMin", s.area,
            s.category_id AS "categoryId", c.name AS "categoryName",
            (SELECT count(*)::int FROM bookings b WHERE b.service_id = s.id AND ${OPEN_SQL}) AS "openBookings"
     FROM services s
     JOIN categories c ON c.id = s.category_id
     WHERE s.provider_id = $1 AND s.active
     ORDER BY s.created_at DESC`,
    [currentUser(req).id],
  );
  res.json({ services });
});

// ── PUBLIC: one service ────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const service = await queryOne(`${SERVICE_CARD_SQL} WHERE s.id = $1 AND s.active AND p.approved`, [req.params.id]);
  if (!service) throw new HttpError(404, "Service not found");
  res.json({ service });
});

// ── PROVIDER: create ───────────────────────────────────────────
router.post("/", requireAuth, requireRole("PROVIDER"), async (req, res) => {
  const data = serviceSchema.parse(req.body);
  const providerId = currentUser(req).id;

  // A service with no working hours has no free times, so nobody could book it.
  const hours = await queryOne<{ count: number }>(
    "SELECT count(*)::int AS count FROM availability WHERE provider_id = $1",
    [providerId],
  );
  if (!hours?.count) throw new HttpError(400, "Set your working hours (at least one day) before adding a service");

  const service = await queryOne(
    `INSERT INTO services (provider_id, category_id, title, description, price, duration_min, area)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, title, description, price, duration_min AS "durationMin", area, category_id AS "categoryId"`,
    [providerId, data.categoryId, data.title, data.description, data.price, data.durationMin, data.area],
  );
  res.status(201).json({ service });
});

// ── PROVIDER: edit (only my own) ───────────────────────────────
router.patch("/:id", requireAuth, requireRole("PROVIDER"), async (req, res) => {
  const data = serviceSchema.partial().parse(req.body); // every field optional

  const params: unknown[] = [req.params.id, currentUser(req).id];
  const sets: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    params.push(value);
    sets.push(`${COLUMNS[key as keyof typeof COLUMNS]} = $${params.length}`);
  }
  if (sets.length === 0) throw new HttpError(400, "Nothing to update");

  // The ownership check lives in the WHERE: id AND provider_id must both match.
  // Someone else's service → 0 rows → 404 (which also hides that it exists).
  const service = await queryOne(
    `UPDATE services SET ${sets.join(", ")}
     WHERE id = $1 AND provider_id = $2 AND active
     RETURNING id, title, description, price, duration_min AS "durationMin", area, category_id AS "categoryId"`,
    params,
  );
  if (!service) throw new HttpError(404, "Service not found");
  res.json({ service });
});

// ── PROVIDER: soft delete (only my own) ────────────────────────
router.delete("/:id", requireAuth, requireRole("PROVIDER"), async (req, res) => {
  const providerId = currentUser(req).id;

  // A customer is still waiting on this service: finish or cancel that job first.
  const open = await queryOne<{ count: number }>(
    `SELECT count(*)::int AS count FROM bookings b
     WHERE b.service_id = $1 AND b.provider_id = $2 AND ${OPEN_SQL}`,
    [req.params.id, providerId],
  );
  if (open?.count) throw new HttpError(400, "This service has an open booking. Complete it before removing the service");

  const removed = await query(
    "UPDATE services SET active = false WHERE id = $1 AND provider_id = $2 AND active RETURNING id",
    [req.params.id, providerId],
  );
  if (removed.length === 0) throw new HttpError(404, "Service not found");
  res.status(204).end();
});

export default router;
