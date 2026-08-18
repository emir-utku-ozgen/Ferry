import { AnchorError, ANCHOR_TIMEOUT_MS, toAnchorError } from "./anchorError";

/**
 * `fetch()` wrapper for every outbound anchor-facing call. Bounds each
 * attempt to `ANCHOR_TIMEOUT_MS` via `AbortSignal.timeout` so a slow or
 * hanging anchor can't hold an API route open indefinitely, and converts
 * low-level failures (timeout, DNS/connection errors) into a typed
 * `AnchorError` instead of an opaque `TypeError`.
 *
 * `retries` (GAP_ANALYSIS.md §3: "no automated retry loop anywhere")
 * defaults to 0 — safe for non-idempotent calls (SEP-24 session creation,
 * SEP-31/SEP-12 submission), where blindly retrying a request that may
 * have already reached the anchor risks a duplicate transaction. Callers
 * making a read-only GET (SEP-38 price, SEP-24/31 status lookups, SEP-12
 * customer lookups) pass `retries` explicitly to get retry-with-backoff,
 * since re-issuing a GET is always safe. A retry only fires for
 * connectivity-level failures (`ANCHOR_TIMEOUT` / `NETWORK_ERROR`) — a
 * definite anchor response (any status code, including 5xx) is returned
 * as-is, never retried, because the anchor already answered.
 */
export async function anchorFetch(
  url: string,
  init: RequestInit,
  context: string,
  options: { retries?: number } = {}
): Promise<Response> {
  const maxRetries = options.retries ?? 0;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(ANCHOR_TIMEOUT_MS) });
    } catch (err) {
      const anchorErr = toAnchorError(err, context);
      const retryable = anchorErr.code === "ANCHOR_TIMEOUT" || anchorErr.code === "NETWORK_ERROR";
      if (!retryable || attempt >= maxRetries) throw anchorErr;
      await sleep(backoffMs(attempt));
    }
  }
}

function backoffMs(attempt: number): number {
  const base = 250 * 2 ** attempt; // 250ms, 500ms, 1000ms, ...
  const jitter = Math.random() * 100;
  return Math.min(base + jitter, 4_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Throws a typed `AnchorError` for a non-OK anchor HTTP response. */
export async function assertAnchorOk(res: Response, context: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  const code = res.status >= 500 ? "ANCHOR_UNAVAILABLE" : "ANCHOR_REJECTED";
  throw new AnchorError(code, `${context} failed (${res.status}): ${body}`, res.status);
}
