/**
 * Client-side counterpart to `lib/stellar/anchorError.ts`'s `AnchorError`:
 * every `/api/*` route returns `{ error, code? }` on failure, and this
 * preserves `code` on the thrown error so UI code (e.g. StatusTracker's
 * error classification) can branch on failure type instead of matching
 * message strings.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Shared fetch-and-parse helper for all client-side calls into Ferry's own `/api/*` routes. */
export async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.code);
  }
  return data as T;
}
