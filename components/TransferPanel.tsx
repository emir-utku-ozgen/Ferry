"use client";

import { useEffect, useRef, useState } from "react";
import { signTransaction } from "@stellar/freighter-api";
import { NotFoundError } from "@stellar/stellar-sdk";
import {
  createSep31Transaction,
  fetchSep31Transaction,
  type Sep31TransactionResult,
  type Sep31TransactionStatus,
} from "@/lib/stellar/client/sep31Client";
import type { FirmQuote } from "@/lib/stellar/client/sep38Client";
import { NETWORK_PASSPHRASE } from "@/lib/stellar/config";
import {
  buildChangeTrustXdr,
  describeLowReserveError,
  describeUnderfundedError,
  hasTrustline,
  submitSignedTransaction,
} from "@/lib/stellar/trustline";
import { buildSep31PaymentXdr } from "@/lib/stellar/payment";
import { freighterErrorMessage } from "@/lib/stellar/freighterError";
import { ApiError } from "@/lib/stellar/client/http";
import type { FlowError, KycStatus } from "@/components/StatusTracker";
import { EURC_ISSUER } from "@/lib/stellar/config";

// EURC listed first — it's the actual settlement asset for the EUR(EURC)
// -> TRY corridor's SEP-31 leg (see mock-anchor/), the corridor this
// panel exists for.
const SETTLEMENT_ASSETS = [
  { code: "EURC", label: "EURC", issuer: EURC_ISSUER },
  { code: "USDC", label: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" },
  { code: "native", label: "XLM", issuer: null },
  { code: "SRT", label: "SRT", issuer: "GCDNJUBQSX7AJWLJACMJ7I4BC3Z47BQUTMHEICZLE6MU4KQBRYG5JY6B" },
] as const;

function issuerForAssetCode(code: string): string | null {
  return SETTLEMENT_ASSETS.find((a) => a.code === code)?.issuer ?? null;
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

// An anchor-side rejection of an already-expired quote_id at SEP-31 create
// time (as opposed to Ferry's own client-side pre-flight block) — distinct
// from a generic anchor_rejected so it renders the quote_expired screen
// (with its "lock a fresh quote" action) instead of a dead-end rejection.
const ANCHOR_QUOTE_EXPIRED_PATTERN = /quote_expired|quote .* expired/i;

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

function buyAssetLabel(asset: string): string {
  return asset.startsWith("iso4217:") ? asset.split(":")[1] : asset;
}

/** Classifies a caught error into the FlowError shape StatusTracker renders a dedicated screen for. */
export function classifyTransferError(err: unknown): FlowError {
  const message = err instanceof Error ? err.message : "Transfer failed";
  if (err instanceof ApiError && err.code === "ANCHOR_REJECTED") {
    if (ANCHOR_QUOTE_EXPIRED_PATTERN.test(message)) {
      return { type: "quote_expired", message };
    }
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
 * movement via SEP-31 — a direct payment request, created after SEP-12
 * customer info has been accepted, using the locked SEP-38 quote so the
 * recipient's net payout is guaranteed rather than re-priced at submission
 * time. Ferry's own SEP-24 (hosted deposit/withdrawal) integration still
 * exists and is still tested (lib/stellar/sep24.ts, app/api/sep24/*) — it's
 * just not surfaced in this Transfer panel, which is scoped to the
 * corridor's actual settlement mechanism (SEP-31 direct payments), not a
 * dead code removal.
 */
export default function TransferPanel(props: TransferPanelProps) {
  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Transfer</h2>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-400">SEP-31 Direct</span>
      </div>

      <Sep31Panel {...props} />
    </div>
  );
}

type TrustlineStatus = "unknown" | "checking" | "missing" | "present" | "error";

/** The single failure surface for both the trustline-establish and payment-submission steps below — one styled card, one Try Again action, regardless of which step failed. */
type PaymentFlowErrorKind = "cancelled" | "insufficient_balance" | "account_not_found" | "submission_failed";

interface PaymentFlowError {
  kind: PaymentFlowErrorKind;
  message: string;
  retry: () => void;
}

const PAYMENT_FLOW_ERROR_TITLES: Record<PaymentFlowErrorKind, string> = {
  cancelled: "Transaction was cancelled by user",
  insufficient_balance: "Insufficient balance",
  account_not_found: "Account not found on Testnet",
  submission_failed: "Transaction failed",
};

function PaymentFlowErrorCard({ error, busy }: { error: PaymentFlowError; busy: boolean }) {
  const isCancelled = error.kind === "cancelled";
  return (
    <div className={`rounded-lg border p-3 ${isCancelled ? "border-amber-500/30 bg-amber-500/10" : "border-red-500/30 bg-red-500/10"}`}>
      <p className={`text-xs font-semibold ${isCancelled ? "text-amber-300" : "text-red-400"}`}>
        {PAYMENT_FLOW_ERROR_TITLES[error.kind]}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{error.message}</p>
      <button
        onClick={error.retry}
        disabled={busy}
        className={`mt-3 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
          isCancelled
            ? "border-amber-400/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
            : "border-red-400/40 bg-red-400/10 text-red-300 hover:bg-red-400/20"
        }`}
      >
        {busy ? "Retrying…" : "Try Again"}
      </button>
    </div>
  );
}

function Sep31Panel({ anchorDomain, publicKey, token, lockedQuote, kycStatus, onOpenKyc, onTransferStatusChange, onFlowError }: BaseTransferProps) {
  const [amount, setAmount] = useState(lockedQuote?.sell_amount ?? "10");
  const [assetCode, setAssetCode] = useState<string>(SETTLEMENT_ASSETS[0].code);
  const [result, setResult] = useState<Sep31TransactionResult | null>(null);
  const [status, setStatus] = useState<Sep31TransactionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [linkCopied, setLinkCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The one-click settlement payment — closes the gap where the sender
  // previously had to copy `result.stellar_account_id`/`stellar_memo` into
  // an external wallet by hand (SOW: "neither side touches crypto").
  const [trustlineStatus, setTrustlineStatus] = useState<TrustlineStatus>("unknown");
  // Distinct from `flowError` below: this is the trustline *existence
  // check* (a read-only Horizon query) failing, e.g. a transient network
  // blip — not a signing or submission failure, so it doesn't get the
  // full styled card + Try Again treatment, just a plain inline note.
  const [trustlineCheckError, setTrustlineCheckError] = useState<string | null>(null);
  const [establishingTrustline, setEstablishingTrustline] = useState(false);
  const [paying, setPaying] = useState(false);
  // The one failure surface for both establishTrustline() and payNow() —
  // whichever Freighter-signing or Horizon-submission step failed, this is
  // what renders (PaymentFlowErrorCard, defined above TransferPanel).
  const [flowError, setFlowError] = useState<PaymentFlowError | null>(null);
  const [paymentTxHash, setPaymentTxHash] = useState<string | null>(null);

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
  // up.
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

  const paymentAssetIssuer = issuerForAssetCode(assetCode);
  const trustlineRequiredForPayment = assetCode !== "native" && paymentAssetIssuer !== null;

  // Pre-flight check (GAP_ANALYSIS.md §4.3):
  // once a transaction is created, verify the sender's own account already
  // trusts the settlement asset before offering the "Pay" button — otherwise
  // the payment would fail with `op_no_trust` only after the sender already
  // clicked pay. Runs once `result` exists, not before (no point checking
  // ahead of having anything to pay).
  useEffect(() => {
    if (!result || !trustlineRequiredForPayment || !paymentAssetIssuer) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setTrustlineStatus("checking");
        setTrustlineCheckError(null);
      }
    });
    (async () => {
      const exists = await hasTrustline(publicKey, assetCode, paymentAssetIssuer).catch((err) => {
        if (!cancelled) {
          setTrustlineStatus("error");
          setTrustlineCheckError(err instanceof Error ? err.message : "Failed to check trustline status");
        }
        return null;
      });
      if (!cancelled && exists !== null) setTrustlineStatus(exists ? "present" : "missing");
    })();
    return () => {
      cancelled = true;
    };
  }, [result, trustlineRequiredForPayment, paymentAssetIssuer, assetCode, publicKey]);

  async function establishTrustline() {
    if (!paymentAssetIssuer) return;
    setEstablishingTrustline(true);
    setFlowError(null);
    try {
      const xdr = await buildChangeTrustXdr(publicKey, assetCode, paymentAssetIssuer);
      const signed = await signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address: publicKey });
      if (signed.error) {
        setFlowError({
          kind: "cancelled",
          message: freighterErrorMessage(signed.error, "The Freighter signing request was closed before it was approved."),
          retry: establishTrustline,
        });
        return;
      }
      await submitSignedTransaction(signed.signedTxXdr);
      setTrustlineStatus("present");
    } catch (err) {
      if (err instanceof NotFoundError) {
        setFlowError({
          kind: "account_not_found",
          message: "This account doesn't exist on Testnet yet. Fund it via Friendbot, then try again.",
          retry: establishTrustline,
        });
      } else {
        const reserveIssue = describeLowReserveError(err);
        setFlowError({
          kind: reserveIssue ? "insufficient_balance" : "submission_failed",
          message: reserveIssue ?? (err instanceof Error ? err.message : "Failed to establish trustline"),
          retry: establishTrustline,
        });
      }
    } finally {
      setEstablishingTrustline(false);
    }
  }

  /**
   * The 1-click settlement payment: builds the SEP-31 payment transaction
   * to `result.stellar_account_id` with `result.stellar_memo`, requests a
   * Freighter signature, and submits it to Horizon directly — no external
   * wallet UI, no manual address/memo entry. `onTransferStatusChange` is
   * nudged to "pending_receiver" immediately so the tracker doesn't sit on
   * its pre-payment state for a full poll cycle; the anchor's own poller
   * (already running via startPolling from send()) remains the source of
   * truth for when it actually flips to "completed".
   */
  async function payNow() {
    if (!result?.stellar_account_id) return;
    setPaying(true);
    setFlowError(null);
    try {
      const xdr = await buildSep31PaymentXdr(
        publicKey,
        result.stellar_account_id,
        assetCode,
        paymentAssetIssuer,
        amount,
        result.stellar_memo,
        result.stellar_memo_type
      );
      const signed = await signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address: publicKey });
      if (signed.error) {
        setFlowError({
          kind: "cancelled",
          message: freighterErrorMessage(signed.error, "The Freighter signing request was closed before it was approved."),
          retry: payNow,
        });
        return;
      }
      const submitted = await submitSignedTransaction(signed.signedTxXdr);
      setPaymentTxHash(submitted.hash);
      onTransferStatusChange("pending_receiver");
    } catch (err) {
      if (err instanceof NotFoundError) {
        setFlowError({
          kind: "account_not_found",
          message: "This account doesn't exist on Testnet yet. Fund it via Friendbot, then try again.",
          retry: payNow,
        });
      } else {
        // Two distinct "insufficient balance" causes: not enough of the
        // settlement asset itself (op_underfunded) vs. not enough XLM to
        // cover the reserve/network fee (describeLowReserveError's case).
        const balanceIssue = describeUnderfundedError(err, assetCode) ?? describeLowReserveError(err);
        setFlowError({
          kind: balanceIssue ? "insufficient_balance" : "submission_failed",
          message: balanceIssue ?? (err instanceof Error ? err.message : "Failed to submit payment"),
          retry: payNow,
        });
      }
    } finally {
      setPaying(false);
    }
  }

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
    setTrustlineStatus("unknown");
    setTrustlineCheckError(null);
    setFlowError(null);
    setPaymentTxHash(null);
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
            min="0.0001"
            max="1000"
            step="0.0001"
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
            {SETTLEMENT_ASSETS.map((a) => (
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
              Settling to <span className="font-mono text-emerald-300">{result.stellar_account_id}</span>
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

      {result && trustlineRequiredForPayment && trustlineStatus === "checking" && (
        <p className="text-[11px] text-zinc-500">Checking whether this account trusts {assetCode}…</p>
      )}

      {result && trustlineRequiredForPayment && trustlineStatus === "missing" && !flowError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-300">Trustline required before paying</p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
            This account has no trustline to {assetCode} yet. Establishing it only asks Freighter to sign a
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

      {result && trustlineRequiredForPayment && trustlineStatus === "error" && trustlineCheckError && (
        <p className="text-xs text-red-400">Trustline check failed: {trustlineCheckError}</p>
      )}

      {result && !paymentTxHash && !flowError && (!trustlineRequiredForPayment || trustlineStatus === "present") && (
        <button
          onClick={payNow}
          disabled={paying}
          className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-emerald-400 disabled:opacity-50"
        >
          {paying ? "Waiting for Freighter signature…" : "Pay with Freighter"}
        </button>
      )}

      {result && !flowError && (
        <p className="text-[11px] leading-relaxed text-zinc-600">
          One click signs and submits the settlement payment straight from your connected wallet — the exact amount
          and memo above, no copying addresses by hand.
        </p>
      )}

      {flowError && <PaymentFlowErrorCard error={flowError} busy={paying || establishingTrustline} />}

      {paymentTxHash && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-zinc-300">
          <p className="font-semibold text-emerald-300">✓ Payment submitted from your wallet</p>
          <p className="mt-1 break-all font-mono text-[11px] text-zinc-400">{paymentTxHash}</p>
          <p className="mt-1 text-[11px] text-zinc-600">Waiting for the anchor to detect and confirm it below.</p>
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
