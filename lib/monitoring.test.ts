import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentAlerts, recordFailure } from "./monitoring";

describe("recordFailure / currentAlerts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not alert below the failure threshold", () => {
    const route = `route-${Math.random()}`;
    for (let i = 0; i < 4; i++) recordFailure(route);
    expect(currentAlerts()).not.toContain(route);
  });

  it("alerts once the threshold is crossed within the window", () => {
    const route = `route-${Math.random()}`;
    for (let i = 0; i < 5; i++) recordFailure(route);
    expect(currentAlerts()).toContain(route);
  });

  it("does not count failures outside the 5-minute trailing window", () => {
    const route = `route-${Math.random()}`;
    for (let i = 0; i < 4; i++) recordFailure(route);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    recordFailure(route); // only 1 failure now inside the window
    expect(currentAlerts()).not.toContain(route);
  });

  it("re-arms once a route's failure rate drops back under threshold", () => {
    const route = `route-${Math.random()}`;
    for (let i = 0; i < 5; i++) recordFailure(route);
    expect(currentAlerts()).toContain(route);

    vi.advanceTimersByTime(5 * 60_000 + 1);
    recordFailure(route);
    expect(currentAlerts()).not.toContain(route);
  });
});
