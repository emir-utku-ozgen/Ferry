"use client";

import { useState, type FormEvent } from "react";
import { fetchFirmQuote, fetchIndicativePrice, type FirmQuote } from "@/lib/stellar/client/sep38Client";

// Matches the asset pairs the default test anchor (testanchor.stellar.org)
// actually advertises via GET /sep38/info — fiat in, Stellar asset out.
const SELL_ASSETS = [
  { value: "iso4217:USD", label: "USD" },
  { value: "iso4217:CAD", label: "CAD" },
] as const;

const BUY_ASSETS = [
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

/**
 * Rate calculator: an unauthenticated SEP-38 indicative price preview, plus
 * (once a SEP-10 session exists) a "Lock this rate" action that requests a
 * firm, time-limited quote — the quote id later gets passed into the
 * SEP-24/31 transfer step to guarantee the shown rate.
 */
export default function QuoteCalculator({ anchorDomain, token, lockedQuote, onQuoteLocked }: QuoteCalculatorProps) {
  const [sellAsset, setSellAsset] = useState<string>(SELL_ASSETS[0].value);
  const [buyAsset, setBuyAsset] = useState<string>(BUY_ASSETS[0].value);
  const [amount, setAmount] = useState("100");
  const [indicative, setIndicative] = useState<{ price: string; buy_amount: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(err instanceof Error ? err.message : "Failed to fetch quote");
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
      setError(err instanceof Error ? err.message : "Failed to lock quote");
    } finally {
      setLocking(false);
    }
  }

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Rate Calculator</h2>

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
          <p className="text-sm text-zinc-400">Recipient gets ≈ {indicative.buy_amount}</p>

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
        <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs text-zinc-500">Locked quote (SEP-38 firm quote)</p>
          <p className="mt-1 text-lg font-semibold text-emerald-300">1 = {lockedQuote.price}</p>
          <p className="text-sm text-zinc-400">
            {lockedQuote.sell_amount} → {lockedQuote.buy_amount}
          </p>
          <p className="mt-1 font-mono text-[11px] text-zinc-500">
            id {lockedQuote.id} · expires {new Date(lockedQuote.expires_at).toLocaleTimeString()}
          </p>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
        Rates are fetched live from the anchor&apos;s SEP-38 quote server ({anchorDomain}) and are indicative
        only until locked in as part of a transfer.
      </p>
    </div>
  );
}
