import type { RequestHandler } from "express";
import { env } from "../config/env.ts";

// The few security headers we need (what the helmet package would add).
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff"); // don't guess file types
  res.setHeader("Referrer-Policy", "no-referrer"); // don't leak our URLs to other sites
  res.setHeader("X-Frame-Options", "DENY"); // nobody may put our site in an <iframe>
  // Only load scripts/styles/images from our own domain: blocks most injected scripts (XSS).
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  if (env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains"); // HTTPS only
  }
  next();
};

// One line per request: "POST /api/bookings 201 34ms" (what morgan would print).
export const requestLogger: RequestHandler = (req, res, next) => {
  if (env.NODE_ENV === "test") return next();
  const start = performance.now();
  res.on("finish", () => {
    const ms = Math.round(performance.now() - start);
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
};
