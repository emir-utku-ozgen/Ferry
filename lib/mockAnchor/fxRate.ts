/**
 * Live EUR -> TRY reference rate for the embedded mock anchor's SEP-38
 * price/quote endpoints.
 *
 * Sources, tried in order:
 *   1. Coinbase public exchange-rates API (https://api.coinbase.com/v2/
 *      exchange-rates): intraday mid-market rate, updated every minute or
 *      so. Free, no API key.
 *   2. Frankfurter (https://frankfurter.dev): European Central Bank daily
 *      reference rate. Free, no API key.
 *   3. ExchangeRate-API open endpoint (https://open.er-api.com): free, no
 *      key, updated daily.
 *   4. MOCK_EURC_TRY_RATE: the previous fixed illustrative rate. Used only
 *      if every live source is unreachable, and labelled as such.
 *
 * The anchor is still simulated: TRY is a Testnet mock asset and nothing
 * settles in real lira. Only the *rate* is live.
 */

import { MOCK_EURC_TRY_RATE } from "@/lib/mockAnchor/config";

export const FALLBACK_EUR_TRY_RATE = MOCK_EURC_TRY_RATE;

export type FxRateSource = "coinbase" | "frankfurter-ecb" | "open-er-api" | "fallback-fixed";

export interface FxRate {
  rate: number;
  source: FxRateSource;
  /** When the provider says the rate was published (ISO date or timestamp). */
  asOf: string | null;
  fetchedAt: string;
}

const CACHE_TTL_MS = 5 * 60_000;
const FALLBACK_RETRY_MS = 60_000;
const FETCH_TIMEOUT_MS = 4_000;

let cached: { value: FxRate; expiresAt: number } | null = null;
let inflight: Promise<FxRate> | null = null;

function isPlausible(rate: unknown): rate is number {
  // Guards against a provider returning garbage: EUR/TRY has been well
  // inside this band for years, and a quote at 0 or 10_000 would be a bug.
  return typeof rate === "number" && Number.isFinite(rate) && rate > 1 && rate < 1_000;
}

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.json();
}

async function fromCoinbase(fetchImpl: typeof fetch): Promise<FxRate> {
  const data = (await getJson("https://api.coinbase.com/v2/exchange-rates?currency=EUR", fetchImpl)) as {
    data?: { rates?: { TRY?: string } };
  };
  const rate = Number(data.data?.rates?.TRY);
  if (!isPlausible(rate)) throw new Error("Coinbase returned no usable TRY rate");
  const fetchedAt = new Date().toISOString();
  // Coinbase doesn't publish a timestamp; the rate is current as of the fetch.
  return { rate, source: "coinbase", asOf: fetchedAt, fetchedAt };
}

async function fromFrankfurter(fetchImpl: typeof fetch): Promise<FxRate> {
  const data = (await getJson("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=TRY", fetchImpl)) as {
    date?: string;
    rates?: { TRY?: number };
  };
  const rate = data.rates?.TRY;
  if (!isPlausible(rate)) throw new Error("Frankfurter returned no usable TRY rate");
  return { rate, source: "frankfurter-ecb", asOf: data.date ?? null, fetchedAt: new Date().toISOString() };
}

async function fromOpenErApi(fetchImpl: typeof fetch): Promise<FxRate> {
  const data = (await getJson("https://open.er-api.com/v6/latest/EUR", fetchImpl)) as {
    result?: string;
    time_last_update_utc?: string;
    rates?: { TRY?: number };
  };
  const rate = data.rates?.TRY;
  if (data.result !== "success" || !isPlausible(rate)) throw new Error("open.er-api returned no usable TRY rate");
  const asOf = data.time_last_update_utc ? new Date(data.time_last_update_utc).toISOString() : null;
  return { rate, source: "open-er-api", asOf, fetchedAt: new Date().toISOString() };
}

async function fetchLiveRate(fetchImpl: typeof fetch): Promise<FxRate> {
  for (const source of [fromCoinbase, fromFrankfurter, fromOpenErApi]) {
    try {
      return await source(fetchImpl);
    } catch (err) {
      console.warn(`[mock-anchor] EUR/TRY rate source failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.error(
    `[mock-anchor] All live EUR/TRY sources failed; quoting at the fixed fallback rate ${FALLBACK_EUR_TRY_RATE}.`
  );
  return { rate: FALLBACK_EUR_TRY_RATE, source: "fallback-fixed", asOf: null, fetchedAt: new Date().toISOString() };
}

/**
 * Current EUR -> TRY rate, refreshed at most every 5 minutes per warm
 * instance. A fallback result is cached for one
 * minute only, so a short outage recovers quickly.
 */
export async function getEurTryRate(fetchImpl: typeof fetch = fetch): Promise<FxRate> {
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  if (!inflight) {
    inflight = fetchLiveRate(fetchImpl)
      .then((value) => {
        const ttl = value.source === "fallback-fixed" ? FALLBACK_RETRY_MS : CACHE_TTL_MS;
        cached = { value, expiresAt: Date.now() + ttl };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Test-only: clears the in-memory cache. */
export function resetEurTryRateCache(): void {
  cached = null;
  inflight = null;
}
