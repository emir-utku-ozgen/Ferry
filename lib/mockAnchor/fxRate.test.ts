import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_EUR_TRY_RATE, getEurTryRate, resetEurTryRateCache } from "@/lib/mockAnchor/fxRate";

type Responder = (url: string) => { ok: boolean; status?: number; body?: unknown } | Error;

function fakeFetch(responder: Responder) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const r = responder(url);
    if (r instanceof Error) throw r;
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.body } as Response;
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

const FRANKFURTER = { date: "2026-11-04", rates: { TRY: 56.3598 } };
const OPEN_ER = { result: "success", time_last_update_utc: "Wed, 04 Nov 2026 00:02:31 +0000", rates: { TRY: 56.017 } };

describe("getEurTryRate", () => {
  beforeEach(() => {
    resetEurTryRateCache();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("uses the ECB rate from Frankfurter when available", async () => {
    const f = fakeFetch((url) => (url.includes("frankfurter") ? { ok: true, body: FRANKFURTER } : new Error("unused")));
    const fx = await getEurTryRate(f);
    expect(fx).toMatchObject({ rate: 56.3598, source: "frankfurter-ecb", asOf: "2026-11-04" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("falls back to open.er-api when Frankfurter fails", async () => {
    const f = fakeFetch((url) => (url.includes("frankfurter") ? { ok: false, status: 503 } : { ok: true, body: OPEN_ER }));
    const fx = await getEurTryRate(f);
    expect(fx).toMatchObject({ rate: 56.017, source: "open-er-api" });
    expect(fx.asOf).toBe("2026-11-04T00:02:31.000Z");
  });

  it("rejects implausible values and uses the fixed fallback when every source fails", async () => {
    const f = fakeFetch((url) =>
      url.includes("frankfurter") ? { ok: true, body: { rates: { TRY: 0 } } } : new Error("network down")
    );
    const fx = await getEurTryRate(f);
    expect(fx).toMatchObject({ rate: FALLBACK_EUR_TRY_RATE, source: "fallback-fixed", asOf: null });
  });

  it("caches a live rate instead of refetching on every quote", async () => {
    const f = fakeFetch(() => ({ ok: true, body: FRANKFURTER }));
    await getEurTryRate(f);
    await getEurTryRate(f);
    await Promise.all([getEurTryRate(f), getEurTryRate(f)]);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
