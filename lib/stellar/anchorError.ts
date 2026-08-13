/**
 * Typed error taxonomy for anchor-facing network calls (Gap 4.4 in
 * GAP_ANALYSIS.md). Every SEP module throws `AnchorError` instead of a
 * bare `Error`, so both API routes and UI code can branch on `.code`
 * instead of pattern-matching an error message string.
 */

export type AnchorErrorCode = "ANCHOR_TIMEOUT" | "ANCHOR_UNAVAILABLE" | "ANCHOR_REJECTED" | "NETWORK_ERROR";

/** Bound applied to every outbound anchor-facing network call. */
export const ANCHOR_TIMEOUT_MS = 10_000;

export class AnchorError extends Error {
  readonly code: AnchorErrorCode;
  /** The anchor's HTTP status, when the error came from a non-OK response. */
  readonly status?: number;

  constructor(code: AnchorErrorCode, message: string, status?: number) {
    super(message);
    this.name = "AnchorError";
    this.code = code;
    this.status = status;
  }
}

function isTimeoutLike(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === "TimeoutError" || err.name === "AbortError";
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (code === "ECONNABORTED" || code === "ETIMEDOUT") return true;
  }
  return err instanceof Error && /timeout/i.test(err.message);
}

/**
 * Normalizes anything thrown by a failed anchor-facing call (fetch
 * rejection, aborted signal, or the Stellar SDK's axios-based TOML
 * resolver) into a typed `AnchorError`.
 */
export function toAnchorError(err: unknown, context: string): AnchorError {
  if (err instanceof AnchorError) return err;
  if (isTimeoutLike(err)) {
    return new AnchorError("ANCHOR_TIMEOUT", `${context} timed out after ${ANCHOR_TIMEOUT_MS / 1000}s`);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AnchorError("NETWORK_ERROR", `${context}: ${message}`);
}

export interface ApiErrorPayload {
  error: string;
  code?: AnchorErrorCode;
}

/**
 * Maps a caught error to the HTTP status + JSON body an `/api/*`
 * orchestrator route should return. Timeouts surface as 504 (not a
 * generic 502) so the client can distinguish "the anchor was slow" from
 * "the anchor rejected the request".
 */
export function toApiErrorResponse(err: unknown, fallbackMessage: string): { status: number; body: ApiErrorPayload } {
  if (err instanceof AnchorError) {
    const status =
      err.code === "ANCHOR_TIMEOUT" ? 504 : err.code === "ANCHOR_REJECTED" ? (err.status ?? 502) : 502;
    return { status, body: { error: err.message, code: err.code } };
  }
  return { status: 502, body: { error: err instanceof Error ? err.message : fallbackMessage } };
}
