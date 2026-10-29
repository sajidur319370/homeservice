import express from "express";
import { pool } from "./db/client.ts";
import { requestLogger, securityHeaders } from "./middleware/basics.ts";
import { errorHandler, notFound } from "./middleware/error.ts";

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

// ── Routes are added here from Day 3 (ABOVE notFound) ──

app.use(notFound);
app.use(errorHandler);
