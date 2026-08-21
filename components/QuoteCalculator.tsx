"use client";

import { useEffect, useState, type FormEvent } from "react";
import { fetchFirmQuote, fetchIndicativePrice, type FirmQuote, type Sep38Fee } from "@/lib/stellar/client/sep38Client";
import { ApiError } from "@/lib/stellar/client/http";
import { EURC_ISSUER, MOCK_TRY_ISSUER } from "@/lib/stellar/config";
import { fetchAnchorCurrencies, findCurrencyAsset, type AnchorCurrency } from "@/lib/stellar/client/anchorClient";

// EUR → TRY is Ferry's showcased corridor (sender pays EUR, recipient is
// paid out in Turkish Lira). The EUR leg is represented by Circle's real
// EURC — a Stellar-native asset, not a raw `iso4217:EUR` fiat code, since
// that's what a sender actually holds and sends on-chain (verified issuer:
// CORRIDOR_VERIFICATION.md §5). The TRY leg has no public Testnet anchor
// to point at, so it's represented by Ferry's own mock anchor
// (`mock-anchor/`) — a real Stellar asset, but explicitly NOT a real
// fiat-backed one; see CORRIDOR_VERIFICATION.md §5 and
// mock-anchor/README.md before treating this pairing as anything more
// than a local test harness. Both are only *quotable* when
// `NEXT_PUBLIC_ANCHOR_DOMAIN` actually points at an anchor that supports
// them — the mock anchor for EURC/TRY, same as any other pairing here.
// The USD/CAD → USDC/XLM/SRT pairs remain available because they're what
// the default Testnet anchor (testanchor.stellar.org) has configured in
// its own SEP-38 /info.
const SELL_ASSETS = [
  { value: `stellar:EURC:${EURC_ISSUER}`, label: "EUR (EURC)" },
  { value: "iso4217:USD", label: "USD" },
  { value: "iso4217:CAD", label: "CAD" },
] as const;

const BUY_ASSETS = [
  { value: `stellar:TRY:${MOCK_TRY_ISSUER}`, label: "TRY (Mock Anchor)" },
  { value: "stellar:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5", label: "USDC" },
  { value: "stellar:native", label: "XLM" },
  { value: "stellar:SRT:GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B", label: "SRT" },
] as const;

interface QuoteCalculatorProps {
  anchorDomain: string;
  token: string | null;
  lockedQuote: FirmQuote | null;
  onQuoteLocked: (quote: FirmQuote) => void;
}

function currencyLabel(asset: string): string {
  if (asset.startsWith("iso4217:")) return asset.split(":")[1];
  if (asset === "stellar:native") return "XLM";
  const parts = asset.split(":");
  return parts.length >= 2 ? parts[1] : asset;
}

/**
 * Resolves a `stellar:<code>:<issuer>` value against whichever issuer the
 * *currently configured* anchor actually publishes for that code (via its
 * SEP-1 `[[CURRENCIES]]` list), falling back to the hardcoded default when
 * the anchor doesn't list it. This is what makes the TRY (and any other
 * Stellar-asset) option work against `mock-anchor/` regardless of which
 * issuer keypair that particular running instance happens to be using —
 * `mock-anchor/`'s TRY issuer is only fixed for as long as its `.env`
 * pins one; without that, a fresh boot generates a different keypair, and
 * a hardcoded `NEXT_PUBLIC_MOCK_TRY_ISSUER` default would silently go
 * stale. `iso4217:*` and `stellar:native` values have no issuer to
 * resolve and are returned unchanged.
 */
function resolveAssetValue(staticValue: string, currencies: AnchorCurrency[]): string {
  const parts = staticValue.split(":");
  if (parts[0] !== "stellar" || parts.length < 3) return staticValue;
  const code = parts[1];
  return findCurrencyAsset(currencies, code) ?? staticValue;
}

// `testanchor.stellar.org`'s SEP-38 /info only advertises SRT, USDC, XLM,
// USD and CAD (verified live) — EUR and TRY were never configured on it at
// all. That 404 is a real, anchor-side "this pair isn't supported" answer,
// not a bug in how Ferry builds the request, so it's worth surfacing as
// its own clear message instead of the anchor's raw JSON body.
const UNSUPPORTED_ASSET_PATTERN = /sell_asset not found|buy_asset not found/i;

function describeQuoteError(err: unknown, sellAsset: string, buyAsset: string, anchorDomain: string): string {
  if (err instanceof ApiError && err.status === 404 && UNSUPPORTED_ASSET_PATTERN.test(err.message)) {
    // Naming the actual configured anchor here is what makes this
    // diagnosable from the UI alone: this message fires whenever *whatever
    // anchor NEXT_PUBLIC_ANCHOR_DOMAIN currently points at* rejects the
    // pair — which could mean the mock anchor (EURC/TRY-capable) simply
    // isn't the anchor actually configured on this deployment, not that
    // no anchor anywhere supports the pair.
    return `"${anchorDomain}" doesn't support ${currencyLabel(sellAsset)} → ${currencyLabel(buyAsset)} yet (see CORRIDOR_VERIFICATION.md). If you expected the EUR/TRY-capable mock anchor here, check that NEXT_PUBLIC_ANCHOR_DOMAIN is actually pointed at it — this message means ${anchorDomain} itself doesn't advertise this pair, not that no anchor anywhere does. Try USD → USDC, USD → XLM, or USD → SRT instead to see a live quote against this anchor today.`;
  }
  return err instanceof Error ? err.message : "Failed to fetch quote";
}

/** Formats whole seconds as "M:SS" (e.g. 65 -> "1:05") for a compact countdown display. */
export function formatCountdown(secondsRemaining: number): string {
  const clamped = Math.max(0, Math.round(secondsRemaining));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Fraction of the quote's total validity window still remaining, clamped
 * to [0, 1] — drives the countdown bar's width and color. Needs `lockedAt`
 * (captured client-side the moment the quote was locked, not something
 * SEP-38 itself reports) since "percent remaining" requires knowing the
 * total window, not just the absolute expiry instant.
 */
export function computeFractionRemaining(nowMs: number, lockedAtMs: number, expiresAtMs: number): number {
  const totalMs = expiresAtMs - lockedAtMs;
  if (totalMs <= 0) return 0;
  return Math.max(0, Math.min(1, (expiresAtMs - nowMs) / totalMs));
}

/** Visual countdown: MM:SS + a depleting progress bar, escalating green -> amber -> red as time runs out. */
function QuoteCountdown({ secondsRemaining, fractionRemaining }: { secondsRemaining: number; fractionRemaining: number }) {
  const tone =
    fractionRemaining > 0.5
      ? { text: "text-emerald-300", bar: "bg-emerald-400" }
      : fractionRemaining > 0.2
        ? { text: "text-amber-300", bar: "bg-amber-400" }
        : { text: "text-red-400", bar: "bg-red-500" };

  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-zinc-500">Quote expires in</span>
        <span className={`font-mono text-sm font-semibold tabular-nums ${tone.text}`}>
          {formatCountdown(secondsRemaining)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${tone.bar}`}
          style={{ width: `${fractionRemaining * 100}%` }}
        />
      </div>
    </div>
  );
}

function FeeBreakdown({ fee }: { fee: Sep38Fee }) {
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <p className="text-[11px] text-zinc-500">
        Fee: {fee.total} {currencyLabel(fee.asset)}
      </p>
      {fee.details?.map((d) => (
        <p key={d.name} className="text-[10px] text-zinc-600">
          · {d.name}: {d.amount}
        </p>
      ))}
    </div>
  );
}

/**
 * Rate calculator: an unauthenticated SEP-38 indicative price preview, plus
 * (once a SEP-10 session exists) a "Lock this rate" action that requests a
 * firm, time-limited quote — the quote id later gets passed into the
 * SEP-31 transfer step to guarantee the shown rate. The locked quote's
 * `buy_amount` is the exact net amount the recipient receives, after the
 * anchor's fee — that's what's highlighted below, not the gross send amount.
 */
export default function QuoteCalculator({ anchorDomain, token, lockedQuote, onQuoteLocked }: QuoteCalculatorProps) {
  const [sellAsset, setSellAsset] = useState<string>(SELL_ASSETS[0].value);
  const [buyAsset, setBuyAsset] = useState<string>(BUY_ASSETS[0].value);
  const [amount, setAmount] = useState("100");
  const [indicative, setIndicative] = useState<{ price: string; buy_amount: string; fee?: Sep38Fee } | null>(null);
  const [loading, setLoading] = useState(false);
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [anchorCurrencies, setAnchorCurrencies] = useState<AnchorCurrency[]>([]);
  // Captured client-side the instant a quote is locked (or refreshed) —
  // SEP-38 only reports the expiry instant, not when the validity window
  // started, but the countdown bar needs the total window to compute a
  // percentage, not just seconds remaining.
  const [lockedAtMs, setLockedAtMs] = useState<number | null>(null);

  // Live countdown for the locked quote's expiry — re-renders once a
  // second so "Refresh quote" appears the instant it goes stale, instead
  // of only being caught later when a submit is attempted.
  useEffect(() => {
    if (!lockedQuote) return;
    let cancelled = false;
    // Deferred one microtask so this isn't a synchronous setState call
    // inside the effect body (react-hooks' set-state-in-effect rule) —
    // same pattern as TransferPanel.tsx's trustline-check effect.
    // Functionally instantaneous either way.
    Promise.resolve().then(() => {
      if (!cancelled) setLockedAtMs(Date.now());
    });
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [lockedQuote]);

  // Discover the currently-configured anchor's real asset issuers (SEP-1
  // CURRENCIES) whenever the anchor changes, so sellAsset/buyAsset resolve
  // against reality instead of a hardcoded guess — see resolveAssetValue().
  // Best-effort: an anchor that doesn't expose this, or a transient
  // failure, just leaves the hardcoded fallback in place.
  useEffect(() => {
    let cancelled = false;
    fetchAnchorCurrencies(anchorDomain)
      .then((currencies) => {
        if (!cancelled) setAnchorCurrencies(currencies);
      })
      .catch(() => {
        if (!cancelled) setAnchorCurrencies([]);
      });
    return () => {
      cancelled = true;
    };
  }, [anchorDomain]);

  const expiresAtMs = lockedQuote ? new Date(lockedQuote.expires_at).getTime() : null;
  const quoteExpired = expiresAtMs !== null && now >= expiresAtMs;
  const secondsToExpiry = expiresAtMs !== null ? Math.max(0, Math.round((expiresAtMs - now) / 1000)) : null;
  const fractionRemaining =
    expiresAtMs !== null && lockedAtMs !== null ? computeFractionRemaining(now, lockedAtMs, expiresAtMs) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setIndicative(null);

    const resolvedSell = resolveAssetValue(sellAsset, anchorCurrencies);
    const resolvedBuy = resolveAssetValue(buyAsset, anchorCurrencies);
    try {
      const price = await fetchIndicativePrice(anchorDomain, {
        sell_asset: resolvedSell,
        buy_asset: resolvedBuy,
        sell_amount: amount,
        context: "sep31",
      });
      setIndicative(price);
    } catch (err) {
      setError(describeQuoteError(err, resolvedSell, resolvedBuy, anchorDomain));
    } finally {
      setLoading(false);
    }
  }

  async function lockRate() {
    if (!token) return;
    setLocking(true);
    setError(null);
    const resolvedSell = resolveAssetValue(sellAsset, anchorCurrencies);
    const resolvedBuy = resolveAssetValue(buyAsset, anchorCurrencies);
    try {
      const quote = await fetchFirmQuote(anchorDomain, token, {
        sell_asset: resolvedSell,
        buy_asset: resolvedBuy,
        sell_amount: amount,
        context: "sep31",
      });
      onQuoteLocked(quote);
    } catch (err) {
      setError(describeQuoteError(err, resolvedSell, resolvedBuy, anchorDomain));
    } finally {
      setLocking(false);
    }
  }

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Rate Calculator · EUR → TRY</h2>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <div className="flex gap-3">
          <label className="flex-1 text-xs text-zinc-500">
            You send
            <input
              type="number"
              min="0.0001"
              max="1000"
              step="0.0001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
          </label>
          <label className="w-28 text-xs text-zinc-500">
            Asset
            <select
              value={sellAsset}
              onChange={(e) => setSellAsset(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            >
              {SELL_ASSETS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-xs text-zinc-500">
          Recipient receives in
          <select
            value={buyAsset}
            onChange={(e) => setBuyAsset(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          >
            {BUY_ASSETS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
        >
          {loading ? "Fetching rate…" : "Get Quote"}
        </button>
      </form>

      {error && <p className="mt-4 text-xs text-red-400">{error}</p>}

      {indicative && !lockedQuote && (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
          <p className="text-xs text-zinc-500">Indicative rate (SEP-38)</p>
          <p className="mt-1 text-lg font-semibold text-white">1 = {indicative.price}</p>
          <p className="text-sm text-zinc-400">
            Recipient nets ≈ {indicative.buy_amount} {currencyLabel(buyAsset)}
            <span className="text-zinc-600"> (after fees)</span>
          </p>
          {indicative.fee && <FeeBreakdown fee={indicative.fee} />}

          {token ? (
            <button
              onClick={lockRate}
              disabled={locking}
              className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {locking ? "Locking rate…" : "Lock this rate (SEP-38)"}
            </button>
          ) : (
            <p className="mt-3 text-[11px] text-zinc-600">Authenticate above to lock a firm, executable quote.</p>
          )}
        </div>
      )}

      {lockedQuote && (
        <div
          className={`mt-4 rounded-lg border p-4 ${
            quoteExpired ? "border-amber-500/30 bg-amber-500/10" : "border-emerald-500/20 bg-emerald-500/5"
          }`}
        >
          <p className="text-xs text-zinc-500">Locked quote (SEP-38 firm quote)</p>
          <p className={`mt-1 text-lg font-semibold ${quoteExpired ? "text-amber-300" : "text-emerald-300"}`}>
            Net {lockedQuote.buy_amount} {currencyLabel(lockedQuote.buy_asset)}
          </p>
          <p className="text-sm text-zinc-400">
            {lockedQuote.sell_amount} {currencyLabel(lockedQuote.sell_asset)} → {lockedQuote.buy_amount}{" "}
            {currencyLabel(lockedQuote.buy_asset)} at 1 = {lockedQuote.price}
          </p>
          {lockedQuote.fee && <FeeBreakdown fee={lockedQuote.fee} />}
          <p className="mt-2 font-mono text-[11px] text-zinc-500">id {lockedQuote.id}</p>

          {quoteExpired ? (
            <button
              onClick={lockRate}
              disabled={locking || !token}
              className="mt-3 w-full rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition-colors hover:bg-red-400/20 disabled:opacity-50"
            >
              {locking ? "Refreshing…" : "Quote Expired — Refresh Quote"}
            </button>
          ) : (
            <QuoteCountdown secondsRemaining={secondsToExpiry ?? 0} fractionRemaining={fractionRemaining} />
          )}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
        Rates are fetched live from the anchor&apos;s SEP-38 quote server ({anchorDomain}) and are indicative only
        until locked. The net amount shown is exactly what the recipient receives — fees are already subtracted.
      </p>
    </div>
  );
}
