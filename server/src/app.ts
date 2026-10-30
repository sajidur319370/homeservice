import express from "express";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.ts";
import { pool } from "./db/client.ts";
import { requestLogger, securityHeaders } from "./middleware/basics.ts";
import { errorHandler, notFound } from "./middleware/error.ts";
import adminRoutes from "./routes/admin.ts";
import authRoutes from "./routes/auth.ts";
import bookingRoutes from "./routes/bookings.ts";
import categoryRoutes from "./routes/categories.ts";
import paymentRoutes from "./routes/payments.ts";
import providerRoutes from "./routes/providers.ts";
import reviewRoutes from "./routes/reviews.ts";
import serviceRoutes from "./routes/services.ts";

export const app = express();

app.disable("x-powered-by"); // don't advertise "Express"
app.set("trust proxy", 1); // Render sits behind a proxy; needed for the real client IP (rate limit)
app.use(securityHeaders);
app.use(requestLogger);
app.use(express.json({ limit: "100kb" })); // JSON body → req.body
app.use(express.urlencoded({ extended: false })); // form bodies (SSLCommerz sends these)

app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1"); // healthy = the database answers too
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", notFound); // unknown /api/... → JSON 404, never index.html

// Production: this same server also sends the built React app (client/dist).
if (env.NODE_ENV === "production") {
  const dist = fileURLToPath(new URL("../../client/dist/", import.meta.url));
  // Files in /assets have a content hash in their name, so browsers may cache them forever.
  app.use("/assets", express.static(`${dist}/assets`, { immutable: true, maxAge: "1y" }));
  app.use(express.static(dist, { index: false }));
  // Any other GET (/bookings, /services/abc…) is a React Router page → send index.html.
  app.get("/{*path}", (_req, res) => res.sendFile("index.html", { root: dist }));
}

app.use(notFound);
app.use(errorHandler);
