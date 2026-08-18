import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkRateLimit } from "./rateLimit";

function requestFrom(ip: string) {
  return new NextRequest("http://localhost/api/test", { headers: { "x-forwarded-for": ip } });
}

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit and counts remaining down", () => {
    const route = `route-${Math.random()}`;
    const req = requestFrom("1.2.3.4");
    const first = checkRateLimit(req, route, { limit: 3, windowMs: 60_000 });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
    const second = checkRateLimit(req, route, { limit: 3, windowMs: 60_000 });
    expect(second.remaining).toBe(1);
  });

  it("rejects once the limit is exhausted, within the same window", () => {
    const route = `route-${Math.random()}`;
    const req = requestFrom("1.2.3.4");
    checkRateLimit(req, route, { limit: 2, windowMs: 60_000 });
    checkRateLimit(req, route, { limit: 2, windowMs: 60_000 });
    const third = checkRateLimit(req, route, { limit: 2, windowMs: 60_000 });
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("tracks separate IPs on separate buckets — one client's usage doesn't affect another's", () => {
    const route = `route-${Math.random()}`;
    checkRateLimit(requestFrom("1.1.1.1"), route, { limit: 1, windowMs: 60_000 });
    const other = checkRateLimit(requestFrom("2.2.2.2"), route, { limit: 1, windowMs: 60_000 });
    expect(other.allowed).toBe(true);
  });

  it("resets the count once the window elapses", () => {
    const route = `route-${Math.random()}`;
    const req = requestFrom("1.2.3.4");
    checkRateLimit(req, route, { limit: 1, windowMs: 1_000 });
    const withinWindow = checkRateLimit(req, route, { limit: 1, windowMs: 1_000 });
    expect(withinWindow.allowed).toBe(false);

    vi.advanceTimersByTime(1_001);
    const afterWindow = checkRateLimit(req, route, { limit: 1, windowMs: 1_000 });
    expect(afterWindow.allowed).toBe(true);
  });
});
