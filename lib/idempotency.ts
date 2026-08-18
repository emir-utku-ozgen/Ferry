/**
 * In-memory idempotency cache for state-mutating orchestrator routes
 * (SEP-24 deposit/withdraw init, SEP-31 transaction creation, SEP-12
 * submission). Closes the "no idempotency mechanism" finding in
 * GAP_ANALYSIS.md §3.
 *
 * Scope, stated plainly rather than implied: this is process-local, like
 * `lib/rateLimit.ts` — it protects against a client retrying the *same*
 * request (e.g. a double-click, or a client-side retry after a dropped
 * response) within one running instance, for `IDEMPOTENCY_TTL_MS`. It does
 * not survive a restart and does not share state across horizontally-scaled
 * instances; that needs a shared store, same caveat as the rate limiter.
 */

interface CachedResponse {
  status: number;
  body: unknown;
  storedAt: number;
}

const IDEMPOTENCY_TTL_MS = 5 * 60_000;
const PRUNE_THRESHOLD = 5_000;

const cache = new Map<string, CachedResponse>();

function pruneExpired(now: number): void {
  for (const [key, entry] of cache) {
    if (now - entry.storedAt > IDEMPOTENCY_TTL_MS) cache.delete(key);
  }
}

/** Returns the cached response for `key` if one exists and hasn't expired, else null. */
export function getIdempotentResponse(key: string): { status: number; body: unknown } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > IDEMPOTENCY_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return { status: entry.status, body: entry.body };
}

/** Records the outcome of a request under `key` so a retry with the same key replays it. */
export function storeIdempotentResponse(key: string, status: number, body: unknown): void {
  const now = Date.now();
  if (cache.size > PRUNE_THRESHOLD) pruneExpired(now);
  cache.set(key, { status, body, storedAt: now });
}
