import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { isPgError, query, queryOne, withTransaction } from "../db/client.ts";
import { HttpError } from "../lib/http.ts";
import { signToken } from "../lib/jwt.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { currentUser, requireAuth } from "../middleware/auth.ts";
import { rateLimit } from "../middleware/rate-limit.ts";
import type { Role } from "../types.ts";

const router = Router();

// 20 attempts per 15 minutes per IP on register/login (slows down password guessing).
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20 });

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email"));

const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(60),
    email,
    password: z.string().min(8, "Password must be at least 8 characters").max(100),
    phone: z.string().trim().max(20).optional(),
    role: z.enum(["CUSTOMER", "PROVIDER"]).default("CUSTOMER"), // ADMIN is impossible (BR-10)
    area: z.string().trim().min(2).max(40).optional(),
  })
  .refine((d) => d.role !== "PROVIDER" || d.area, { message: "Area is required for providers", path: ["area"] });

const loginSchema = z.object({ email, password: z.string().min(1) });

type UserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  password_hash: string;
  area: string | null;
  approved: boolean | null;
};

const USER_SQL = `
  SELECT u.id, u.name, u.email, u.phone, u.role, u.password_hash, p.area, p.approved
  FROM users u
  LEFT JOIN provider_profiles p ON p.user_id = u.id`;

// What the browser may see. Never send password_hash.
function publicUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    provider: u.role === "PROVIDER" ? { area: u.area, approved: u.approved } : null,
  };
}

// Hashing a dummy password when the email doesn't exist makes "no such email" take as long
// as "wrong password", so response times don't reveal which emails are registered.
const DUMMY_HASH = await hashPassword("not-a-real-password");

router.post("/register", authLimiter, async (req, res) => {
  const data = registerSchema.parse(req.body); // throws ZodError → 400
  const passwordHash = await hashPassword(data.password);
  const id = randomUUID();

  try {
    // User + provider profile in ONE transaction: both rows or neither.
    await withTransaction(async (tx) => {
      await query(
        "INSERT INTO users (id, name, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, $5, $6)",
        [id, data.name, data.email, passwordHash, data.phone ?? null, data.role],
        tx,
      );
      if (data.role === "PROVIDER") {
        await query("INSERT INTO provider_profiles (user_id, area) VALUES ($1, $2)", [id, data.area], tx);
      }
    });
  } catch (err) {
    if (isPgError(err, "23505")) throw new HttpError(409, "This email is already registered");
    throw err;
  }

  const user = await queryOne<UserRow>(`${USER_SQL} WHERE u.id = $1`, [id]);
  res.status(201).json({ token: signToken({ id, role: data.role }), user: user && publicUser(user) });
});

router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await queryOne<UserRow>(`${USER_SQL} WHERE u.email = $1`, [email]);
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);

  // Same message for "no such email" and "wrong password" (no user enumeration).
  if (!user || !ok) throw new HttpError(401, "Wrong email or password");

  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await queryOne<UserRow>(`${USER_SQL} WHERE u.id = $1`, [currentUser(req).id]);
  if (!user) throw new HttpError(401, "Account no longer exists");
  res.json({ user: publicUser(user) });
});

export default router;
