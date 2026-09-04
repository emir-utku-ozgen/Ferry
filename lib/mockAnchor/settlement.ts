/**
 * Pure, unit-testable decision logic backing the embedded mock anchor's
 * SEP-31 quote-expiry and payment-settlement checks. TypeScript port of
 * mock-anchor/settlement.js — kept side-effect-free and independent of
 * Horizon/Next.js so it's testable without a network call.
 */

const DEFAULT_EPSILON = 1e-7;

export interface SettlementQuote {
  expires_at: string;
}

export interface SettlementPayment {
  amount: string;
}

/** True if `quote.expires_at` (an ISO-8601 string) is at or before `nowMs`. */
export function isQuoteExpired(quote: SettlementQuote, nowMs: number = Date.now()): boolean {
  return new Date(quote.expires_at).getTime() <= nowMs;
}

/** Sums the `amount` field (a numeric string, per Horizon's payment record shape) across payment records. */
export function sumPaymentAmounts(payments: SettlementPayment[]): number {
  return payments.reduce((sum, p) => sum + Number(p.amount), 0);
}

/**
 * True if the cumulative amount received under a transaction's memo covers
 * what was invoiced, within a small floating-point tolerance. Without this,
 * a payment matching only on memo — regardless of amount — would be
 * reported as a completed settlement.
 */
export function isSettlementSufficient(receivedAmount: number, requiredAmount: number, epsilon = DEFAULT_EPSILON): boolean {
  return receivedAmount + epsilon >= requiredAmount;
}
