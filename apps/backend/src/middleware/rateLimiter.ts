import { Request, Response, NextFunction } from "express";

// ─── Types ────────────────────────────────────────────────────────────

interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface LimitConfig {
  capacity: number;
  refillRate: number; // tokens per second
}

// ─── Configuration ───────────────────────────────────────────────────

const LIMITS: Record<string, LimitConfig> = {
  ADMINISTRADOR: { capacity: 60, refillRate: 1 }, // 60 tokens, 1/sec
  CAPITANA: { capacity: 20, refillRate: 0.33 }, // 20 tokens, ~0.33/sec
};

const DEFAULT_LIMIT = LIMITS.CAPITANA;

// ─── State ───────────────────────────────────────────────────────────

const buckets = new Map<string, Bucket>();

// ─── Cleanup ─────────────────────────────────────────────────────────

// Remove stale buckets every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const STALE_THRESHOLD = 5 * 60 * 1000;

setInterval(() => {
  const cutoff = Date.now() - STALE_THRESHOLD;
  for (const [key, bucket] of buckets) {
    if (bucket.lastRefill < cutoff) {
      buckets.delete(key);
    }
  }
}, CLEANUP_INTERVAL).unref(); // unref so it doesn't keep the process alive in tests

// ─── Middleware ───────────────────────────────────────────────────────

export const rateLimiter = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const userId = req.usuario!.id;
  const rol = req.usuario!.rol;
  const limit = LIMITS[rol] || DEFAULT_LIMIT;

  let bucket = buckets.get(userId);
  const now = Date.now();

  if (!bucket) {
    bucket = { tokens: limit.capacity, lastRefill: now };
    buckets.set(userId, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(
    limit.capacity,
    bucket.tokens + elapsed * limit.refillRate
  );
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    const retryAfter = Math.ceil(1 / limit.refillRate);
    res.set("Retry-After", String(retryAfter));
    res.status(429).json({
      error: "Demasiadas solicitudes. Intente de nuevo más tarde.",
      retryAfter,
    });
    return;
  }

  bucket.tokens -= 1;
  next();
};
