"use client";

import { useEffect, useRef, useState } from "react";
import { signTransaction } from "@stellar/freighter-api";
import { NotFoundError } from "@stellar/stellar-sdk";
import {
  fetchSep24Transaction,
  startSep24Deposit,
  startSep24Withdrawal,
  type InteractiveSession,
  type Sep24TransactionStatus,
} from "@/lib/stellar/client/sep24Client";
import {
  createSep31Transaction,
  fetchSep31Transaction,
  type Sep31TransactionResult,
  type Sep31TransactionStatus,
} from "@/lib/stellar/client/sep31Client";
import type { FirmQuote } from "@/lib/stellar/client/sep38Client";
import { NETWORK_PASSPHRASE } from "@/lib/stellar/config";
import { buildChangeTrustXdr, describeLowReserveError, hasTrustline, submitSignedTransaction } from "@/lib/stellar/trustline";
import { freighterErrorMessage } from "@/lib/stellar/freighterError";
import { ApiError } from "@/lib/stellar/client/http";
import type { FlowError, KycStatus } from "@/components/StatusTracker";
import { EURC_ISSUER } from "@/lib/stellar/config";

// EURC listed first — it's the actual settlement asset for the EUR(EURC)
// -> TRY corridor's SEP-31 leg (see mock-anchor/), which now defaults
// this dropdown. It's also selectable for SEP-24, though neither
// testanchor.stellar.org nor the mock anchor (which implements SEP-31
// only, not SEP-24) support a EURC deposit/withdraw session — selecting
// it there surfaces the same honest anchor-rejection pattern as any
// other unsupported pairing in this app.
const SEP24_ASSETS = [
  { code: "EURC", label: "EURC", issuer: EURC_ISSUER },
  { code: "USDC", label: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
  { code: "native", label: "XLM", issuer: null },
  { code: "SRT", label: "SRT", issuer: "GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B" },
] as const;

function issuerForAssetCode(code: string): string | null {
  return SEP24_ASSETS.find((a) => a.code === code)?.issuer ?? null;
}

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

// SEP-31 rejection messages this reference anchor is known to return for a
// server-side asset-configuration gap, independent of anything the sender
// did — worth surfacing distinctly from a generic rejection (e.g. a bad
// field value) so the message doesn't imply the sender should retry with
// different input, which wouldn't change anything here.
const ANCHOR_ASSET_CONFIG_PATTERN = /has no fields definition|asset .* not (found|supported)/i;

interface BaseTransferProps {
  anchorDomain: string;
  publicKey: string;
  token: string;
  lockedQuote: FirmQuote | null;
  kycStatus: KycStatus;
  onOpenKyc: () => void;
  onTransferStatusChange: (status: string | null) => void;
  onFlowError: (error: FlowError | null) => void;
}

type TransferPanelProps = BaseTransferProps;

function assetCodeFromSep38Asset(asset: string): string {
  if (asset === "stellar:native") return "native";
  const parts = asset.split(":");
  return parts.length >= 2 ? parts[1] : asset;
}

function buyAssetLabel(asset: string): string {
  return asset.startsWith("iso4217:") ? asset.split(":")[1] : asset;
}

/** Classifies a caught error into the FlowError shape StatusTracker renders a dedicated screen for. */
function classifyTransferError(err: unknown): FlowError {
  const message = err instanceof Error ? err.message : "Transfer failed";
  if (err instanceof ApiError && err.code === "ANCHOR_REJECTED") {
    if (ANCHOR_ASSET_CONFIG_PATTERN.test(message)) {
      return { type: "anchor_rejected", message: `Anchor cannot settle this asset automatically: ${message}` };
    }
    if (/bank|iban|account.number|routing/i.test(message)) {
      return { type: "invalid_recipient_details", message };
    }
  }
  return { type: "anchor_rejected", message };
}

/**
 * Step 4 of the flow: hands off to the anchor for the actual value
 * movement. SEP-24 opens the anchor-hosted deposit/withdrawal UI (all
 * KYC/funding details stay there) and polls for status; SEP-31 posts a
 * direct payment request after SEP-12 customer info has been accepted,
 * using the locked SEP-38 quote so the recipient's net payout is
 * guaranteed rather than re-priced at submission time.
 *
 * There is deliberately no "fallback" that silently substitutes a SEP-24
 * deposit for a failed SEP-31 payment and reports it as settled: SEP-24
 * deposits a Stellar asset into the *sender's own* wallet, it does not pay
 * a third-party recipient in TRY, and no anchor configured here supports
 * TRY at all yet (see GAP_ANALYSIS.md §2). A SEP-31 failure is reported as
 * exactly that — a failure — never re-labeled as success.
 */
export default function TransferPanel(props: TransferPanelProps) {
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

      {mode === "sep24" ? <Sep24Panel {...props} /> : <Sep31Panel {...props} />}
    </div>
  );
}

type TrustlineStatus = "unknown" | "checking" | "missing" | "present" | "error";

function Sep24Panel({ anchorDomain, publicKey, token, lockedQuote, onTransferStatusChange }: TransferPanelProps) {
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

  const [trustlineStatus, setTrustlineStatus] = useState<TrustlineStatus>("unknown");
  const [trustlineError, setTrustlineError] = useState<string | null>(null);
  const [establishingTrustline, setEstablishingTrustline] = useState(false);

  const issuer = issuerForAssetCode(assetCode);
  const trustlineRequired = direction === "deposit" && assetCode !== "native" && issuer !== null;

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Pre-flight check (Gap 4.3): before a non-native deposit is even
  // attempted, verify the destination account already trusts the asset —
  // otherwise the anchor's hosted deposit would fail only after the user
  // has completed KYC/funding there.
  useEffect(() => {
    if (!trustlineRequired || !issuer) {
      // Nothing to reset here: every read of `trustlineStatus` below is
      // itself gated on `trustlineRequired`, so a stale value from a
      // previously-selected asset is simply ignored once it no longer
      // applies — no need to synchronously clear it on every effect run.
      return;
    }
    let cancelled = false;
    // Deferred one microtask so the "checking" transition itself isn't a
    // synchronous setState call inside the effect body (react-hooks'
    // set-state-in-effect rule) — functionally instantaneous either way.
    Promise.resolve().then(() => {
      if (!cancelled) {
        setTrustlineStatus("checking");
        setTrustlineError(null);
      }
    });
    (async () => {
      const exists = await hasTrustline(publicKey, assetCode, issuer).catch((err) => {
        if (!cancelled) {
          setTrustlineStatus("error");
          setTrustlineError(err instanceof Error ? err.message : "Failed to check trustline status");
        }
        return null;
      });
      if (!cancelled && exists !== null) {
        setTrustlineStatus(exists ? "present" : "missing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trustlineRequired, issuer, assetCode, publicKey]);

  async function establishTrustline() {
    if (!issuer) return;
    setEstablishingTrustline(true);
    setTrustlineError(null);
    try {
      const xdr = await buildChangeTrustXdr(publicKey, assetCode, issuer);
      const signed = await signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address: publicKey });
      if (signed.error) {
        throw new Error(freighterErrorMessage(signed.error, "Freighter declined to sign the trustline transaction"));
      }
      await submitSignedTransaction(signed.signedTxXdr);
      setTrustlineStatus("present");
    } catch (err) {
      if (err instanceof NotFoundError) {
        setTrustlineError("This account doesn't exist on Testnet yet. Fund it via Friendbot, then try again.");
      } else {
        setTrustlineError(describeLowReserveError(err) ?? (err instanceof Error ? err.message : "Failed to establish trustline"));
      }
    } finally {
      setEstablishingTrustline(false);
    }
  }

  function startPolling(id: string, transferId?: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const tx = await fetchSep24Transaction(anchorDomain, token, id, transferId);
        setStatus(tx);
        onTransferStatusChange(tx.status);
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
    if (trustlineRequired && trustlineStatus !== "present") {
      setError("This account needs a trustline for the selected asset before depositing — see below.");
      return;
    }
    setLoading(true);
    setError(null);
    setSession(null);
    setStatus(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      const result =
        direction === "deposit"
          ? await startSep24Deposit(
              anchorDomain,
              token,
              { asset_code: assetCode, account: publicKey, amount },
              { idempotencyKey, transferId: lockedQuote?.id }
            )
          : await startSep24Withdrawal(
              anchorDomain,
              token,
              { asset_code: assetCode, account: publicKey, amount },
              { idempotencyKey, transferId: lockedQuote?.id }
            );
      setSession(result);
      onTransferStatusChange("incomplete");
      window.open(result.url, "_blank", "noopener,noreferrer,width=480,height=760");
      startPolling(result.id, lockedQuote?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start SEP-24 session");
    } finally {
      setLoading(false);
    }
  }

  const depositBlocked = trustlineRequired && trustlineStatus === "missing";

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

      {trustlineRequired && trustlineStatus === "checking" && (
        <p className="text-[11px] text-zinc-500">Checking whether this account trusts {assetCode}…</p>
      )}

      {depositBlocked && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-300">Trustline required</p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
            This account has no trustline to {assetCode} yet, so the anchor&apos;s deposit would fail after you
            already completed its hosted flow. Establish the trustline first — this only asks Freighter to sign a
            <code className="mx-1 rounded bg-black/30 px-1 py-0.5 font-mono">ChangeTrust</code>
            operation and does not move any funds.
          </p>
          <button
            onClick={establishTrustline}
            disabled={establishingTrustline}
            className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-400/20 disabled:opacity-50"
          >
            {establishingTrustline ? "Waiting for Freighter signature…" : `Establish trustline for ${assetCode}`}
          </button>
        </div>
      )}

      {trustlineRequired && trustlineStatus === "error" && trustlineError && !depositBlocked && (
        <p className="text-xs text-red-400">Trustline check failed: {trustlineError}</p>
      )}
      {trustlineError && depositBlocked && <p className="text-xs text-red-400">{trustlineError}</p>}

      <button
        onClick={start}
        disabled={loading || depositBlocked || (trustlineRequired && trustlineStatus === "checking")}
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
          {(status.refunded || status.status === "refunded") && (
            <div className="mt-2 border-t border-white/10 pt-2">
              <p className="text-[11px] font-semibold text-emerald-300">✓ Refunded by anchor</p>
              {status.refunds ? (
                <>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {status.refunds.amount_refunded} refunded
                    {status.refunds.amount_fee && status.refunds.amount_fee !== "0" ? ` (anchor fee ${status.refunds.amount_fee})` : ""}
                  </p>
                  {status.refunds.payments?.map((p) => (
                    <p key={p.id} className="text-[11px] text-zinc-600">
                      · {p.amount} via {p.id_type ?? "payment"} <span className="font-mono">{p.id}</span>
                    </p>
                  ))}
                </>
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500">
                  The anchor reported this transaction as refunded but didn&apos;t include refund payment details.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Sep31Panel({ anchorDomain, publicKey, token, lockedQuote, kycStatus, onOpenKyc, onTransferStatusChange, onFlowError }: BaseTransferProps) {
  const [amount, setAmount] = useState(lockedQuote?.sell_amount ?? "10");
  const [assetCode, setAssetCode] = useState<string>(SEP24_ASSETS[0].code);
  const [result, setResult] = useState<Sep31TransactionResult | null>(null);
  const [status, setStatus] = useState<Sep31TransactionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [linkCopied, setLinkCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!lockedQuote) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [lockedQuote]);

  // The piece that was missing: creating a SEP-31 transaction only ever
  // set an optimistic one-time status ("pending_external"); nothing polled
  // the anchor afterward, so a transfer that genuinely settled on-chain
  // never made the status tracker's "Completed / Delivered" step go green,
  // and there was nowhere in the UI a completed transfer's own hash showed
  // up. Mirrors Sep24Panel's existing poll loop below.
  function startPolling(id: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const tx = await fetchSep31Transaction(anchorDomain, token, id);
        setStatus(tx);
        onTransferStatusChange(tx.status);
        if (TERMINAL_STATUSES.has(tx.status) && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      } catch {
        // Transient network error — keep polling, next tick may succeed.
      }
    }, POLL_INTERVAL_MS);
  }

  const quoteExpired = lockedQuote ? now >= new Date(lockedQuote.expires_at).getTime() : false;
  const kycRequired = kycStatus !== "ACCEPTED";

  function recipientLink(): string | null {
    if (!lockedQuote || typeof window === "undefined") return null;
    const url = new URL(`/claim/${lockedQuote.id}`, window.location.origin);
    url.searchParams.set("domain", anchorDomain);
    url.searchParams.set("token", token);
    url.searchParams.set("account", publicKey);
    url.searchParams.set("net", lockedQuote.buy_amount);
    url.searchParams.set("asset", buyAssetLabel(lockedQuote.buy_asset));
    return url.toString();
  }

  async function copyRecipientLink() {
    const link = recipientLink();
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function send() {
    if (lockedQuote && quoteExpired) {
      setError("Your locked quote has expired. Return to the rate calculator and lock a fresh quote.");
      onFlowError({ type: "quote_expired", message: `Quote ${lockedQuote.id} expired at ${lockedQuote.expires_at}.` });
      return;
    }
    if (kycRequired) {
      setError("Complete SEP-12 KYC before sending — see the KYC step above.");
      return;
    }
    setLoading(true);
    setError(null);
    onFlowError(null);
    setResult(null);
    setStatus(null);
    try {
      const tx = await createSep31Transaction(
        anchorDomain,
        token,
        {
          amount,
          asset_code: assetCode,
          quote_id: lockedQuote?.id,
          funding_method: "SWIFT",
          fields: {},
        },
        { idempotencyKey: crypto.randomUUID() }
      );
      setResult(tx);
      onTransferStatusChange("pending_receiver");
      startPolling(tx.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create SEP-31 transaction";
      setError(message);
      onFlowError(classifyTransferError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {lockedQuote && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] text-zinc-500">Recipient will net (locked quote)</p>
          <p className="text-lg font-semibold text-white">
            {lockedQuote.buy_amount} {buyAssetLabel(lockedQuote.buy_asset)}
          </p>
        </div>
      )}

      {lockedQuote && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] text-zinc-500">Recipient link</p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
            Send this to your recipient — they open it, enter their name and IBAN, and it goes straight to the
            anchor. No Stellar wallet needed on their end.
          </p>
          <button
            onClick={copyRecipientLink}
            className="mt-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-white/10"
          >
            {linkCopied ? "Copied!" : "Copy recipient link"}
          </button>
        </div>
      )}

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
          Settlement asset
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
      <p className="text-[10px] text-zinc-600">
        Settlement asset is the Stellar token the sending anchor moves to the receiving anchor — separate from the
        EUR/TRY fiat legs, which the locked quote above already fixes.
      </p>

      {lockedQuote && <p className="text-[11px] text-zinc-600">Using locked quote {lockedQuote.id}</p>}

      {lockedQuote && quoteExpired && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-300">Quote expired</p>
          <p className="mt-1 text-[11px] text-amber-200/80">
            Return to the rate calculator and lock a fresh quote before sending.
          </p>
        </div>
      )}

      {kycRequired ? (
        <button
          onClick={onOpenKyc}
          className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-400/20"
        >
          Complete SEP-12 KYC to enable sending
        </button>
      ) : (
        <button
          onClick={send}
          disabled={loading || (lockedQuote != null && quoteExpired)}
          className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
        >
          {loading ? "Sending…" : "Send via SEP-31"}
        </button>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-600">
        This reference test anchor requires SEP-12 customer records and — separately — a per-asset SEP-31 field
        configuration it doesn&apos;t currently expose for every asset. A real anchor rejection here surfaces
        below, unmasked, rather than being hidden or silently retried against a different SEP.
      </p>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-xs text-red-400">{error}</p>
          <button
            onClick={() => {
              setError(null);
              onFlowError(null);
            }}
            className="mt-2 text-[11px] font-semibold text-red-300 underline"
          >
            Dismiss and try again
          </button>
        </div>
      )}

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

      {status && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-xs text-zinc-500">Live transaction status</p>
          <p className="mt-1 text-sm font-semibold text-emerald-300">{status.status}</p>
          {status.stellar_transaction_id && (
            <div className="mt-2 border-t border-white/10 pt-2">
              <p className="text-[11px] font-semibold text-emerald-300">✓ Settlement payment confirmed on-chain</p>
              <p className="mt-1 break-all font-mono text-[11px] text-zinc-400">{status.stellar_transaction_id}</p>
            </div>
          )}
          {status.payout_stellar_transaction_id && (
            <p className="mt-1 break-all font-mono text-[11px] text-zinc-600">
              payout {status.payout_stellar_transaction_id}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
