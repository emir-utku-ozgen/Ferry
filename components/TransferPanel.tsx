"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchSep24Transaction,
  startSep24Deposit,
  startSep24Withdrawal,
  type InteractiveSession,
  type Sep24TransactionStatus,
} from "@/lib/stellar/client/sep24Client";
import { createSep31Transaction, type Sep31TransactionResult } from "@/lib/stellar/client/sep31Client";
import type { FirmQuote } from "@/lib/stellar/client/sep38Client";

const SEP24_ASSETS = [
  { code: "USDC", label: "USDC" },
  { code: "native", label: "XLM" },
  { code: "SRT", label: "SRT" },
] as const;

const POLL_INTERVAL_MS = 4000;
const TERMINAL_STATUSES = new Set([
  "completed",
  "refunded",
  "expired",
  "error",
  "no_market",
  "too_small",
  "too_large",
]);

interface BaseTransferProps {
  anchorDomain: string;
  token: string;
  lockedQuote: FirmQuote | null;
}

interface TransferPanelProps extends BaseTransferProps {
  publicKey: string;
}

function assetCodeFromSep38Asset(asset: string): string {
  if (asset === "stellar:native") return "native";
  const parts = asset.split(":");
  return parts.length >= 2 ? parts[1] : asset;
}

/**
 * Step 4 of the flow: hands off to the anchor for the actual value
 * movement. SEP-24 opens the anchor-hosted deposit/withdrawal UI (all
 * KYC/funding details stay there) and polls for status; SEP-31 posts a
 * direct payment request and surfaces whatever the anchor returns —
 * including validation errors, since many anchors gate SEP-31 behind
 * out-of-band SEP-12 customer registration that Ferry doesn't perform.
 */
export default function TransferPanel({ anchorDomain, publicKey, token, lockedQuote }: TransferPanelProps) {
  const [mode, setMode] = useState<"sep24" | "sep31">("sep24");

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Transfer</h2>
        <div className="flex rounded-full border border-white/10 p-0.5 text-xs">
          <button
            onClick={() => setMode("sep24")}
            className={`rounded-full px-3 py-1 transition-colors ${mode === "sep24" ? "bg-white text-black" : "text-zinc-400"}`}
          >
            SEP-24 Hosted
          </button>
          <button
            onClick={() => setMode("sep31")}
            className={`rounded-full px-3 py-1 transition-colors ${mode === "sep31" ? "bg-white text-black" : "text-zinc-400"}`}
          >
            SEP-31 Direct
          </button>
        </div>
      </div>

      {mode === "sep24" ? (
        <Sep24Panel anchorDomain={anchorDomain} publicKey={publicKey} token={token} lockedQuote={lockedQuote} />
      ) : (
        <Sep31Panel anchorDomain={anchorDomain} token={token} lockedQuote={lockedQuote} />
      )}
    </div>
  );
}

function Sep24Panel({ anchorDomain, publicKey, token, lockedQuote }: TransferPanelProps) {
  const [direction, setDirection] = useState<"deposit" | "withdraw">("deposit");
  const [assetCode, setAssetCode] = useState<string>(
    lockedQuote ? assetCodeFromSep38Asset(lockedQuote.buy_asset) : SEP24_ASSETS[0].code
  );
  const [amount, setAmount] = useState("5");
  const [session, setSession] = useState<InteractiveSession | null>(null);
  const [status, setStatus] = useState<Sep24TransactionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const tx = await fetchSep24Transaction(anchorDomain, token, id);
        setStatus(tx);
        if (TERMINAL_STATUSES.has(tx.status) && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Transient network error — keep polling, next tick may succeed.
      }
    }, POLL_INTERVAL_MS);
  }

  async function start() {
    setLoading(true);
    setError(null);
    setSession(null);
    setStatus(null);
    try {
      const result =
        direction === "deposit"
          ? await startSep24Deposit(anchorDomain, token, { asset_code: assetCode, account: publicKey, amount })
          : await startSep24Withdrawal(anchorDomain, token, { asset_code: assetCode, account: publicKey, amount });
      setSession(result);
      window.open(result.url, "_blank", "noopener,noreferrer,width=480,height=760");
      startPolling(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start SEP-24 session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex gap-3">
        <label className="flex-1 text-xs text-zinc-500">
          Direction
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as "deposit" | "withdraw")}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          >
            <option value="deposit">Deposit (fiat → Stellar)</option>
            <option value="withdraw">Withdraw (Stellar → fiat)</option>
          </select>
        </label>
        <label className="w-28 text-xs text-zinc-500">
          Asset
          <select
            value={assetCode}
            onChange={(e) => setAssetCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          >
            {SEP24_ASSETS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="w-24 text-xs text-zinc-500">
          Amount
          <input
            type="number"
            min="1"
            max="10"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          />
        </label>
      </div>

      <button
        onClick={start}
        disabled={loading}
        className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
      >
        {loading ? "Opening anchor session…" : `Start Hosted ${direction === "deposit" ? "Deposit" : "Withdrawal"}`}
      </button>

      <p className="text-[11px] text-zinc-600">
        This test anchor accepts 1–10 units per transaction. A popup opens the anchor&apos;s own hosted UI —
        Ferry never sees the KYC or bank details entered there.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {session && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-400">
          <p>
            Session <span className="font-mono text-zinc-300">{session.id}</span>
          </p>
          <a href={session.url} target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline">
            Reopen hosted UI
          </a>
        </div>
      )}

      {status && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-xs text-zinc-500">Live transaction status</p>
          <p className="mt-1 text-sm font-semibold text-emerald-300">{status.status}</p>
        </div>
      )}
    </div>
  );
}

function Sep31Panel({ anchorDomain, token, lockedQuote }: BaseTransferProps) {
  const [amount, setAmount] = useState(lockedQuote?.sell_amount ?? "10");
  const [assetCode, setAssetCode] = useState<string>(SEP24_ASSETS[0].code);
  const [result, setResult] = useState<Sep31TransactionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const tx = await createSep31Transaction(anchorDomain, token, {
        amount,
        asset_code: assetCode,
        quote_id: lockedQuote?.id,
        funding_method: "SWIFT",
        fields: {},
      });
      setResult(tx);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create SEP-31 transaction");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex gap-3">
        <label className="flex-1 text-xs text-zinc-500">
          Amount
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
            value={assetCode}
            onChange={(e) => setAssetCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
          >
            {SEP24_ASSETS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {lockedQuote && <p className="text-[11px] text-zinc-600">Using locked quote {lockedQuote.id}</p>}

      <button
        onClick={send}
        disabled={loading}
        className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
      >
        {loading ? "Sending…" : "Send via SEP-31"}
      </button>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        SEP-31 receivers typically require the sender to have registered KYC information via SEP-12 first, which
        Ferry does not implement. Expect (and this UI will surface) a validation error from the anchor unless
        it has been configured to skip that step.
      </p>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {result && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-zinc-300">
          <p className="text-zinc-500">Transaction created</p>
          <p className="mt-1 font-mono">{result.id}</p>
          {result.stellar_account_id && (
            <p className="mt-1">
              Send to <span className="font-mono text-emerald-300">{result.stellar_account_id}</span>
              {result.stellar_memo && (
                <>
                  {" "}
                  memo <span className="font-mono text-emerald-300">{result.stellar_memo}</span>
                </>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
