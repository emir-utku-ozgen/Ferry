import { AnchorError, ANCHOR_TIMEOUT_MS, toAnchorError } from "./anchorError";

/**
 * `fetch()` wrapper for every outbound anchor-facing call. Bounds the
 * request to `ANCHOR_TIMEOUT_MS` via `AbortSignal.timeout` so a slow or
 * hanging anchor can't hold an API route open indefinitely, and converts
 * low-level failures (timeout, DNS/connection errors) into a typed
 * `AnchorError` instead of an opaque `TypeError`.
 */
export async function anchorFetch(url: string, init: RequestInit, context: string): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ANCHOR_TIMEOUT_MS) });
  } catch (err) {
    throw toAnchorError(err, context);
  }
}

/** Throws a typed `AnchorError` for a non-OK anchor HTTP response. */
export async function assertAnchorOk(res: Response, context: string): Promise<void> {
  if (res.ok) return;
  const body = await res.text().catch(() => "");
  const code = res.status >= 500 ? "ANCHOR_UNAVAILABLE" : "ANCHOR_REJECTED";
  throw new AnchorError(code, `${context} failed (${res.status}): ${body}`, res.status);
}
