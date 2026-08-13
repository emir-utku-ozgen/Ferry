import { NextRequest, NextResponse } from "next/server";

/**
 * In-memory rate limiting for Ferry's anchor-facing orchestrator routes
 * (Gap 4.2 in GAP_ANALYSIS.md). A fixed-window counter keyed by client IP
 * + route name, held in a process-local `Map`.
 *
 * This bounds per-instance abuse (a scripted client hammering an anchor
 * through Ferry, or exhausting our own outbound connection pool) without
 * adding an external dependency. It does **not** share state across
 * multiple server instances — a horizontally-scaled deployment needs a
 * shared store (Upstash Redis / Vercel Edge Config) instead. See the
 * Production Readiness Roadmap in GAP_ANALYSIS.md.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms at which the current window resets. */
  resetAt: number;
}

const DEFAULT_LIMIT = 10;
const DEFAULT_WINDOW_MS = 60_000;

// Once the map grows past this many distinct (route, IP) keys, sweep out
// expired entries so long-running processes don't leak memory.
const PRUNE_THRESHOLD = 5_000;

const buckets = new Map<string, RateLimitEntry>();

function pruneExpired(now: number): void {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}

function getClientIp(req: NextRequest): string {
  // Populated by the hosting platform's edge proxy (e.g. Vercel) in
  // production. Falls back to a shared bucket in local/unproxied dev,
  // where every request looks like it came from the same place.
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

/**
 * Checks (and consumes) one request against the rate limit for
 * `routeName`. Call this first, before doing any other work in the route
 * handler, and short-circuit with `rateLimitResponse()` when not allowed.
 */
export function checkRateLimit(
  req: NextRequest,
  routeName: string,
  options: { limit?: number; windowMs?: number } = {}
): RateLimitResult {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const now = Date.now();
  const key = `${routeName}:${getClientIp(req)}`;

  if (buckets.size > PRUNE_THRESHOLD) pruneExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, limit, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, limit, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, limit, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/** Builds the 429 response for a request rejected by `checkRateLimit`. */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    {
      error: `Too many requests — limit is ${result.limit} per minute. Try again in ${retryAfterSeconds}s.`,
      code: "RATE_LIMITED",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}
