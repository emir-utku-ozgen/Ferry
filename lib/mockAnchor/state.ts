import type { Sep38Fee } from "@/lib/stellar/client/sep38Client";

/**
 * In-memory state for the embedded mock anchor (`app/api/mock-anchor/*`).
 * TypeScript port of mock-anchor/server.js's own module-level Maps.
 *
 * Same intentional non-goal as `lib/idempotency.ts` / `lib/auditTrail.ts`:
 * this is a mock anchor, not a durable service — a restart forgets every
 * customer, quote, and transaction.
 *
 * Same caveat GAP_ANALYSIS.md's own review of Ferry's other in-memory
 * stores already flags, restated here because it applies with equal force:
 * on Vercel's serverless runtime, these `Map`s are process-local to
 * whichever function instance happens to handle a given request. A warm
 * instance serving a single demo session end-to-end (the common case —
 * requests a few seconds apart) will see consistent state; a cold start
 * landing on a *different* instance mid-flow will not see records created
 * on another. This is a real limitation for horizontally-scaled or
 * high-traffic use, not a bug in the logic below — see docs/RUNBOOK.md's
 * embedded-mock-anchor section.
 */

export type MockCustomerStatus = "ACCEPTED" | "NEEDS_INFO";

export interface MockCustomerRecord {
  status: MockCustomerStatus;
  id: string;
  mock_masked_fields?: {
    first_name?: string;
    last_name?: string;
    bank_account_number_masked?: string;
  };
}

export interface MockQuote {
  id: string;
  expires_at: string;
  price: string;
  sell_asset: string;
  buy_asset: string;
  sell_amount: string;
  buy_amount: string;
  fee: Sep38Fee;
}

export type MockTransactionStatus = "pending_receiver" | "completed";

export interface MockTransaction {
  id: string;
  status: MockTransactionStatus;
  quote_id?: string;
  amount: string;
  sender: string;
  created_at: string;
  received_amount?: string;
  stellar_transaction_id?: string;
}

/** "account:type" -> customer record. Namespaced by role — see customerKey() below. */
export const customers = new Map<string, MockCustomerRecord>();
/** quote id -> quote. */
export const quotes = new Map<string, MockQuote>();
/** transaction id -> transaction. */
export const transactions = new Map<string, MockTransaction>();

/**
 * Namespaces a SEP-12 customer record by role, not just by Stellar account.
 * Ferry's recipient claim link reuses the sender's own SEP-10 token/account
 * rather than minting a receiver-scoped one (see docs/KEY_MANAGEMENT.md),
 * so without this, a sender's own already-ACCEPTED KYC record would
 * silently answer for a receiver's claim under the same account too,
 * skipping the IBAN form entirely.
 */
export function customerKey(account: string, type?: string): string {
  return `${account}:${type || "sep31-sender"}`;
}
