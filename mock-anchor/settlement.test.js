"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isQuoteExpired, sumPaymentAmounts, isSettlementSufficient } = require("./settlement");

test("isQuoteExpired — false for a quote that still has time left", () => {
  const quote = { expires_at: new Date(Date.now() + 60_000).toISOString() };
  assert.equal(isQuoteExpired(quote), false);
});

test("isQuoteExpired — true for a quote whose expiry has passed", () => {
  const quote = { expires_at: new Date(Date.now() - 1_000).toISOString() };
  assert.equal(isQuoteExpired(quote), true);
});

test("isQuoteExpired — true exactly at the expiry instant (boundary is inclusive)", () => {
  const now = Date.now();
  const quote = { expires_at: new Date(now).toISOString() };
  assert.equal(isQuoteExpired(quote, now), true);
});

test("sumPaymentAmounts — sums numeric-string amounts across payment records", () => {
  const payments = [{ amount: "0.0009000" }, { amount: "9.9991000" }];
  assert.equal(sumPaymentAmounts(payments), 10);
});

test("sumPaymentAmounts — empty list sums to zero", () => {
  assert.equal(sumPaymentAmounts([]), 0);
});

test("isSettlementSufficient — false for the exact bug this fix closes (0.0009 EURC against a 10 EURC quote)", () => {
  // TESTNET_HASHES.md §8.4: this underpayment was previously reported as a
  // completed settlement because only the memo was checked, never the
  // amount. This case must now be rejected.
  assert.equal(isSettlementSufficient(0.0009, 10), false);
});

test("isSettlementSufficient — true when the received amount exactly covers the invoice", () => {
  assert.equal(isSettlementSufficient(10, 10), true);
});

test("isSettlementSufficient — true for a received amount that exceeds the invoice (overpayment)", () => {
  assert.equal(isSettlementSufficient(10.5, 10), true);
});

test("isSettlementSufficient — floating-point-safe at the boundary (avoids a false negative from binary rounding)", () => {
  // 0.1 + 0.2 !== 0.3 in IEEE 754 — the epsilon tolerance exists so an
  // exact-amount payment isn't spuriously rejected as "insufficient".
  assert.equal(isSettlementSufficient(0.1 + 0.2, 0.3), true);
});

test("isSettlementSufficient — false just under the boundary, beyond the epsilon tolerance", () => {
  assert.equal(isSettlementSufficient(9.9989, 10), false);
});
