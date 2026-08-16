"use client";

import { useEffect, useState, type FormEvent } from "react";
import { fetchFirmQuote, fetchIndicativePrice, type FirmQuote, type Sep38Fee } from "@/lib/stellar/client/sep38Client";
import { ApiError } from "@/lib/stellar/client/http";
import { EURC_ISSUER, MOCK_TRY_ISSUER } from "@/lib/stellar/config";

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

// `testanchor.stellar.org`'s SEP-38 /info only advertises SRT, USDC, XLM,
// USD and CAD (verified live) — EUR and TRY were never configured on it at
// all. That 404 is a real, anchor-side "this pair isn't supported" answer,
// not a bug in how Ferry builds the request, so it's worth surfacing as
// its own clear message instead of the anchor's raw JSON body.
const UNSUPPORTED_ASSET_PATTERN = /sell_asset not found|buy_asset not found/i;

function describeQuoteError(err: unknown, sellAsset: string, buyAsset: string): string {
  if (err instanceof ApiError && err.status === 404 && UNSUPPORTED_ASSET_PATTERN.test(err.message)) {
    return `This anchor doesn't support ${currencyLabel(sellAsset)} → ${currencyLabel(buyAsset)} yet — no EUR/TRY-capable anchor is configured for this Testnet demo (see CORRIDOR_VERIFICATION.md). Try USD → USDC, USD → XLM, or USD → SRT instead to see a live quote today.`;
  }
  return err instanceof Error ? err.message : "Failed to fetch quote";
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

  // Live countdown for the locked quote's expiry — re-renders once a
  // second so "Refresh quote" appears the instant it goes stale, instead
  // of only being caught later when a submit is attempted.
  useEffect(() => {
    if (!lockedQuote) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [lockedQuote]);

  const expiresAtMs = lockedQuote ? new Date(lockedQuote.expires_at).getTime() : null;
  const quoteExpired = expiresAtMs !== null && now >= expiresAtMs;
  const secondsToExpiry = expiresAtMs !== null ? Math.max(0, Math.round((expiresAtMs - now) / 1000)) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setIndicative(null);

    try {
      const price = await fetchIndicativePrice(anchorDomain, {
        sell_asset: sellAsset,
        buy_asset: buyAsset,
        sell_amount: amount,
        context: "sep31",
      });
      setIndicative(price);
    } catch (err) {
      setError(describeQuoteError(err, sellAsset, buyAsset));
    } finally {
      setLoading(false);
    }
  }

  async function lockRate() {
    if (!token) return;
    setLocking(true);
    setError(null);
    try {
      const quote = await fetchFirmQuote(anchorDomain, token, {
        sell_asset: sellAsset,
        buy_asset: buyAsset,
        sell_amount: amount,
        context: "sep31",
      });
      onQuoteLocked(quote);
    } catch (err) {
      setError(describeQuoteError(err, sellAsset, buyAsset));
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
              min="0"
              step="0.01"
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
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-amber-300">This quote has expired.</p>
              <button
                onClick={lockRate}
                disabled={locking || !token}
                className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-400/20 disabled:opacity-50"
              >
                {locking ? "Refreshing…" : "Refresh quote"}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-zinc-500">
              Expires in {secondsToExpiry}s ({new Date(lockedQuote.expires_at).toLocaleTimeString()})
            </p>
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
