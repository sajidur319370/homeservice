import type { RequestHandler } from "express";
import { HttpError } from "../lib/http.ts";

type Options = { windowMs: number; limit: number };

/**
 * Fixed-window limiter kept in memory: at most `limit` requests per IP per window.
 * Good enough for ONE server process. With several instances, move the counters to Redis.
 */
export function rateLimit({ windowMs, limit }: Options): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Forget old windows now and then, so the Map can't grow forever.
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip ?? "unknown";
    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }

    entry.count += 1;
    if (entry.count > limit) {
      res.setHeader("Retry-After", Math.ceil((entry.resetAt - now) / 1000));
      throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
    }
    next();
  };
}
