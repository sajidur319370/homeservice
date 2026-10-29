import { Router } from "express";
import { z } from "zod";
import { query, queryOne } from "../db/client.ts";
import { HttpError } from "../lib/http.ts";
import { requireAuth, requireRole } from "../middleware/auth.ts";

const router = Router();

router.get("/", async (_req, res) => {
  const categories = await query("SELECT id, name, slug FROM categories ORDER BY name");
  res.json({ categories });
});

router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(2).max(40) }).parse(req.body);

  // "AC Technician" → "ac-technician"
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  if (!slug) throw new HttpError(400, "Name needs at least one letter or digit");

  // Duplicate name or slug → unique_violation 23505 → 409 in the error handler.
  const category = await queryOne(
    "INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id, name, slug",
    [name, slug],
  );
  res.status(201).json({ category });
});

router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
  // Removed services are only hidden (active = false) and still point here, so count them all.
  const used = await queryOne<{ count: number }>(
    "SELECT count(*)::int AS count FROM services WHERE category_id = $1",
    [req.params.id],
  );
  if (used && used.count > 0) {
    throw new HttpError(409, `Can't remove: ${used.count} service(s) use this category`);
  }

  const deleted = await query("DELETE FROM categories WHERE id = $1 RETURNING id", [req.params.id]);
  if (deleted.length === 0) throw new HttpError(404, "Category not found");
  res.status(204).end();
});

export default router;
