"use strict";

/**
 * Pure, unit-testable decision logic backing server.js's SEP-31
 * quote-expiry and payment-settlement checks (the P0-1 / P0-3 fixes in the
 * SOW gap analysis this closes: a transaction was previously reported
 * "completed" on a memo-matched payment of any amount, and an expired
 * quote_id was never rejected server-side). Kept side-effect-free and
 * independent of Express/Horizon so it's testable without a running server
 * or network access.
 */

const DEFAULT_EPSILON = 1e-7;

/** True if `quote.expires_at` (an ISO-8601 string) is at or before `nowMs`. */
function isQuoteExpired(quote, nowMs = Date.now()) {
  return new Date(quote.expires_at).getTime() <= nowMs;
}

/** Sums the `amount` field (a numeric string, per Horizon's payment record shape) across payment records. */
function sumPaymentAmounts(payments) {
  return payments.reduce((sum, p) => sum + Number(p.amount), 0);
}

/**
 * True if the cumulative amount received under a transaction's memo covers
 * what was invoiced, within a small floating-point tolerance. This is the
 * check that was missing before: without it, a payment matching only on
 * memo — regardless of amount — was reported as a completed settlement.
 */
function isSettlementSufficient(receivedAmount, requiredAmount, epsilon = DEFAULT_EPSILON) {
  return receivedAmount + epsilon >= requiredAmount;
}

module.exports = { isQuoteExpired, sumPaymentAmounts, isSettlementSufficient };
