import { describe, expect, it } from "vitest";
import { isQuoteExpired, isSettlementSufficient, sumPaymentAmounts } from "./settlement";

describe("isQuoteExpired", () => {
  it("is false before the expiry instant", () => {
    expect(isQuoteExpired({ expires_at: "2026-01-01T00:05:00Z" }, Date.parse("2026-01-01T00:00:00Z"))).toBe(false);
  });

  it("is true at or after the expiry instant", () => {
    expect(isQuoteExpired({ expires_at: "2026-01-01T00:05:00Z" }, Date.parse("2026-01-01T00:05:00Z"))).toBe(true);
    expect(isQuoteExpired({ expires_at: "2026-01-01T00:05:00Z" }, Date.parse("2026-01-01T00:06:00Z"))).toBe(true);
  });
});

describe("sumPaymentAmounts", () => {
  it("sums numeric-string amounts", () => {
    expect(sumPaymentAmounts([{ amount: "1.5" }, { amount: "2.25" }])).toBeCloseTo(3.75);
  });

  it("returns 0 for an empty list", () => {
    expect(sumPaymentAmounts([])).toBe(0);
  });
});

describe("isSettlementSufficient", () => {
  it("is true when the received amount covers the required amount", () => {
    expect(isSettlementSufficient(10, 10)).toBe(true);
    expect(isSettlementSufficient(10.0001, 10)).toBe(true);
  });

  it("is false when the received amount falls short, even by a small margin", () => {
    expect(isSettlementSufficient(9.9, 10)).toBe(false);
    expect(isSettlementSufficient(0.0009, 10)).toBe(false);
  });

  it("tolerates floating-point noise at the boundary", () => {
    expect(isSettlementSufficient(0.1 + 0.2, 0.3)).toBe(true);
  });
});
