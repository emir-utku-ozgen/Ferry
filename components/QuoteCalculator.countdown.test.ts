import { describe, expect, it } from "vitest";
import { computeFractionRemaining, formatCountdown } from "./QuoteCalculator";

describe("formatCountdown", () => {
  it("formats sub-minute values as 0:SS", () => {
    expect(formatCountdown(5)).toBe("0:05");
    expect(formatCountdown(59)).toBe("0:59");
  });

  it("formats minute-plus values as M:SS", () => {
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(300)).toBe("5:00");
  });

  it("clamps a negative value (already expired) to 0:00 rather than showing a negative time", () => {
    expect(formatCountdown(-10)).toBe("0:00");
  });

  it("rounds fractional seconds", () => {
    expect(formatCountdown(59.6)).toBe("1:00");
  });
});

describe("computeFractionRemaining", () => {
  const lockedAtMs = 1_000_000;
  const expiresAtMs = 1_000_000 + 5 * 60_000; // 5-minute window

  it("is 1 at the moment the quote is locked", () => {
    expect(computeFractionRemaining(lockedAtMs, lockedAtMs, expiresAtMs)).toBe(1);
  });

  it("is 0.5 at the halfway point of the window", () => {
    const halfway = lockedAtMs + 2.5 * 60_000;
    expect(computeFractionRemaining(halfway, lockedAtMs, expiresAtMs)).toBeCloseTo(0.5, 5);
  });

  it("is 0 exactly at expiry", () => {
    expect(computeFractionRemaining(expiresAtMs, lockedAtMs, expiresAtMs)).toBe(0);
  });

  it("clamps to 0 past expiry, never negative", () => {
    expect(computeFractionRemaining(expiresAtMs + 60_000, lockedAtMs, expiresAtMs)).toBe(0);
  });

  it("returns 0 for a non-positive window instead of dividing by zero/negative", () => {
    expect(computeFractionRemaining(lockedAtMs, lockedAtMs, lockedAtMs)).toBe(0);
    expect(computeFractionRemaining(lockedAtMs, lockedAtMs, lockedAtMs - 1000)).toBe(0);
  });
});
