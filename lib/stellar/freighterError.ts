/**
 * Freighter's published type declarations reference an unresolvable
 * `@shared/api/types` path, so `FreighterApiError` resolves to `any` for
 * consumers — but at runtime every `{ error }` field is still
 * `{ code, message, ext? }`. This extracts a human-readable message from it.
 */
export function freighterErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return fallback;
}
