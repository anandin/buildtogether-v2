/**
 * Simple in-memory sliding-window rate limiter.
 *
 * For a serverless/Fluid-Compute Express app this is per-instance, not
 * per-user-across-instances. Good enough to stop one client hammering a
 * single warm function, not a replacement for a proper gateway quota.
 *
 * Stricter on /api/guardian/* (OpenAI calls cost real money).
 */
import type { Request, Response, NextFunction } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Key by userId when authed, otherwise by IP. */
function keyFor(req: Request): string {
  const user = (req as any).user;
  if (user?.id) return `u:${user.id}`;
  // Vercel forwards the client IP here
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || "unknown";
  return `ip:${ip}`;
}

export function rateLimit(opts: { windowMs: number; max: number; label?: string }) {
  return function (req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    const key = `${opts.label || "default"}:${keyFor(req)}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    if (bucket.count >= opts.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter.toString());
      res.setHeader("X-RateLimit-Limit", opts.max.toString());
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", Math.ceil(bucket.resetAt / 1000).toString());
      return res.status(429).json({
        error: "Too many requests",
        retryAfter,
      });
    }

    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", opts.max.toString());
    res.setHeader("X-RateLimit-Remaining", (opts.max - bucket.count).toString());
    next();
  };
}

// Predefined limiters
export const guardianLimiter = rateLimit({
  windowMs: 60_000,    // 1 minute
  max: 20,             // 20 Guardian AI calls/min per user
  label: "guardian",
});

export const authLimiter = rateLimit({
  windowMs: 5 * 60_000, // 5 minutes
  max: 10,              // 10 auth attempts per 5 min
  label: "auth",
});

// Opportunistic cleanup of old buckets every ~1000 requests
let cleanupCounter = 0;
export function maybeCleanupBuckets() {
  cleanupCounter += 1;
  if (cleanupCounter % 1000 !== 0) return;
  const now = Date.now();
  for (const [k, b] of buckets.entries()) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}
