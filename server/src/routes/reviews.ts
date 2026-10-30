import { Router } from "express";
import { z } from "zod";
import { currentUser, requireAuth, requireRole } from "../middleware/auth.ts";
import { createReview } from "../services/review.ts";

const router = Router();

const reviewSchema = z.object({
  bookingId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

router.post("/", requireAuth, requireRole("CUSTOMER"), async (req, res) => {
  const data = reviewSchema.parse(req.body);
  const review = await createReview({ customerId: currentUser(req).id, ...data });
  res.status(201).json({ review });
});

export default router;
