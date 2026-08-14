/**
 * Lightweight in-memory transfer audit trail (GAP_ANALYSIS.md §3: "no
 * database, no file-based log... nothing is durably recorded anywhere").
 *
 * Same scope caveat as `lib/rateLimit.ts` and `lib/idempotency.ts`:
 * process-local, not persisted across restarts, not shared across
 * instances. It exists to make a transfer's state transitions inspectable
 * during a session (`GET /api/audit/[transferId]`) rather than losing them
 * entirely, which is what happened before this file existed. A durable
 * audit trail for a production deployment needs a real datastore.
 *
 * `transferId` is the SEP-38 quote id — the first stable identifier that
 * exists in the flow (minted by the anchor when a rate is locked), so
 * every subsequent KYC/deposit/transfer event correlates to it without
 * Ferry needing to mint and track its own transfer identifiers.
 */

export interface AuditEvent {
  timestamp: string;
  event: string;
  status?: string;
  code?: string;
  detail?: string;
}

const MAX_EVENTS_PER_TRANSFER = 200;
const MAX_TRACKED_TRANSFERS = 2_000;

const trails = new Map<string, AuditEvent[]>();

export function recordAuditEvent(transferId: string, event: string, extra: Omit<AuditEvent, "timestamp" | "event"> = {}): void {
  if (!transferId) return;

  if (!trails.has(transferId) && trails.size >= MAX_TRACKED_TRANSFERS) {
    // Evict the oldest tracked transfer to bound memory — this is a
    // demonstration audit trail, not a durable one; see module docstring.
    const oldestKey = trails.keys().next().value;
    if (oldestKey) trails.delete(oldestKey);
  }

  const entries = trails.get(transferId) ?? [];
  entries.push({ timestamp: new Date().toISOString(), event, ...extra });
  if (entries.length > MAX_EVENTS_PER_TRANSFER) entries.shift();
  trails.set(transferId, entries);
}

export function getAuditTrail(transferId: string): AuditEvent[] {
  return trails.get(transferId) ?? [];
}
