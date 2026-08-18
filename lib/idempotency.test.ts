import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getIdempotentResponse, storeIdempotentResponse } from "./idempotency";

describe("idempotency cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for a key that was never stored", () => {
    expect(getIdempotentResponse("never-seen-key")).toBeNull();
  });

  it("replays the exact stored status and body for a repeated key", () => {
    const key = `test-key-${Math.random()}`;
    storeIdempotentResponse(key, 201, { id: "abc123" });
    expect(getIdempotentResponse(key)).toEqual({ status: 201, body: { id: "abc123" } });
  });

  it("still replays just before the 5-minute TTL elapses", () => {
    const key = `test-key-${Math.random()}`;
    storeIdempotentResponse(key, 200, { ok: true });
    vi.advanceTimersByTime(5 * 60_000 - 1);
    expect(getIdempotentResponse(key)).toEqual({ status: 200, body: { ok: true } });
  });

  it("expires a cached response once the 5-minute TTL has elapsed, so a retry doesn't replay a stale response forever", () => {
    const key = `test-key-${Math.random()}`;
    storeIdempotentResponse(key, 200, { ok: true });
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(getIdempotentResponse(key)).toBeNull();
  });
});
