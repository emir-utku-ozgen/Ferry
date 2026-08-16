"use client";

import { useEffect, useState } from "react";
import { fetchAuditTrail, type AuditEvent } from "@/lib/auditClient";

export type FlowErrorType = "quote_expired" | "anchor_rejected" | "invalid_recipient_details" | "kyc_rejected";

export interface FlowError {
  type: FlowErrorType;
  message: string;
}

export type KycStatus = "not_started" | "PROCESSING" | "NEEDS_INFO" | "ACCEPTED" | "REJECTED";

interface StatusTrackerProps {
  transferId?: string;
  hasQuote: boolean;
  quoteExpired: boolean;
  kycStatus: KycStatus;
  transferStatus: string | null;
  error: FlowError | null;
  onDismissError?: () => void;
}

const STEPS = [
  { key: "quote", label: "Quote Locked" },
  { key: "kyc", label: "KYC Verified" },
  { key: "settling", label: "Settling (Stellar Testnet)" },
  { key: "delivered", label: "Completed / Delivered" },
] as const;

const SETTLED_STATUSES = new Set(["completed"]);
const DEPOSIT_INITIATED_STATUSES = new Set([
  "incomplete",
  "pending_user_transfer_start",
  "pending_anchor",
  "pending_stellar",
  "pending_external",
  "pending_user_transfer_complete",
]);

/**
 * Failure Matrix (SOW Deliverable 2/3): the 4 named failure modes, each
 * with a designed error screen and an explicit "clean refund" status.
 *
 * The refund reasoning below is a structural fact about Ferry's current
 * SEP-31 orchestration, not a blanket claim: Ferry only ever displays the
 * anchor's deposit instructions (`stellar_account_id` / `stellar_memo`)
 * *after* `POST /transactions` succeeds, and sending is gated on KYC
 * being `ACCEPTED` and the locked quote being unexpired. All four of
 * these failure types are raised strictly *before* that point — so in
 * every case, no Stellar payment was ever sent, which is what "clean"
 * asserts here. This does not extend to a funded SEP-24 hosted deposit
 * that fails after the user already paid the anchor — that path is
 * tracked separately via the anchor's own `refunded` transaction status
 * (`Sep24Panel`, `TransferPanel.tsx`), not through this error union.
 */
const ERROR_COPY: Record<FlowErrorType, { title: string; hint: string; refundDetail: string }> = {
  quote_expired: {
    title: "Quote expired",
    hint: "The locked rate is no longer valid. Return to the rate calculator and lock a fresh quote before continuing.",
    refundDetail:
      "The expired quote was never submitted to the anchor — sending is blocked client-side before any request goes out, so no funds left your wallet.",
  },
  anchor_rejected: {
    title: "Anchor rejected the request",
    hint: "The receiving anchor declined this transaction. See the message below for the anchor's stated reason.",
    refundDetail:
      "Ferry only shows the anchor's deposit instructions after a SEP-31 transaction is successfully created. Since the anchor rejected the request itself, that point was never reached — no Stellar payment was ever sent.",
  },
  invalid_recipient_details: {
    title: "Recipient bank details rejected",
    hint: "The IBAN or bank account details the anchor received couldn't be validated. Reopen KYC and re-enter them.",
    refundDetail:
      "Same as an anchor rejection above: the anchor refused the transaction request before Ferry ever displayed deposit instructions, so no funds were sent for this rejected IBAN/bank record.",
  },
  kyc_rejected: {
    title: "KYC verification rejected",
    hint: "The anchor rejected the submitted customer information. Review and resubmit in the KYC step.",
    refundDetail:
      "Sending is disabled until KYC status is ACCEPTED — a rejected KYC record never reaches the point where a SEP-31 transaction, let alone a payment, could be created.",
  },
};

function currentStepIndex(hasQuote: boolean, kycStatus: KycStatus, transferStatus: string | null): number {
  if (transferStatus && SETTLED_STATUSES.has(transferStatus)) return 4;
  if (transferStatus && DEPOSIT_INITIATED_STATUSES.has(transferStatus)) return 3;
  if (kycStatus === "ACCEPTED") return 2;
  if (hasQuote) return 1;
  return 0;
}

/**
 * End-to-end transfer lifecycle tracker (distinct from RemittanceFlow's
 * wallet/auth steps above it): Quote Locked → KYC Verified → Settling
 * (Stellar Testnet) → Completed / Delivered, plus a dedicated error
 * screen — with a dismiss action for clean recovery rather than a dead
 * end — for the failure modes that can interrupt that path, and a live
 * audit trail (GAP_ANALYSIS.md §3: "no audit trail can be reconstructed")
 * pulled from GET /api/audit/[transferId].
 */
export default function StatusTracker({
  transferId,
  hasQuote,
  quoteExpired,
  kycStatus,
  transferStatus,
  error,
  onDismissError,
}: StatusTrackerProps) {
  const currentIndex = currentStepIndex(hasQuote, kycStatus, transferStatus);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);

  useEffect(() => {
    // Render below is gated on `transferId &&`, so a stale `auditEvents`
    // value from a previous transfer is simply never shown once
    // `transferId` clears — no need to synchronously reset it here.
    if (!transferId) return;
    let cancelled = false;
    const poll = () => {
      fetchAuditTrail(transferId)
        .then((events) => {
          if (!cancelled) setAuditEvents(events);
        })
        .catch(() => {
          /* audit trail is a convenience view, not load-bearing — ignore transient failures */
        });
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [transferId]);

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Transfer Status</h2>

      <ol className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        {STEPS.map((step, i) => {
          const state = error ? "blocked" : i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
          return (
            <li key={step.key} className="flex flex-1 items-center gap-3 sm:flex-col sm:items-center sm:text-center">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  state === "done"
                    ? "bg-emerald-500 text-black"
                    : state === "active"
                      ? "border border-white text-white"
                      : state === "blocked"
                        ? "border border-red-500/50 text-red-400"
                        : "border border-white/20 text-zinc-600"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span className={state === "pending" ? "text-xs text-zinc-600" : "text-xs text-zinc-200"}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {hasQuote && quoteExpired && !error && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold text-amber-300">Locked quote has expired</p>
          <p className="mt-1 text-[11px] text-amber-200/80">Lock a fresh quote before starting a deposit or payment.</p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm font-semibold text-red-300">{ERROR_COPY[error.type].title}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-red-200/80">{ERROR_COPY[error.type].hint}</p>
          <p className="mt-2 rounded bg-black/30 p-2 font-mono text-[11px] text-red-300/90">{error.message}</p>
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
            <span className="mt-0.5 shrink-0 text-emerald-400" aria-hidden>
              ✓
            </span>
            <p className="text-[11px] leading-relaxed text-emerald-200/80">
              <span className="font-semibold text-emerald-300">Clean refund status: </span>
              {ERROR_COPY[error.type].refundDetail}
            </p>
          </div>
          {onDismissError && (
            <button
              onClick={onDismissError}
              className="mt-3 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-400/20"
            >
              Dismiss and try again
            </button>
          )}
        </div>
      )}

      {transferId && auditEvents.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="text-xs font-semibold text-zinc-400">Audit trail · {transferId}</p>
          <ol className="mt-2 flex flex-col gap-1.5">
            {auditEvents.map((e, i) => (
              <li key={i} className="flex items-baseline gap-2 text-[11px] text-zinc-500">
                <span className="font-mono text-zinc-600">{new Date(e.timestamp).toLocaleTimeString()}</span>
                <span className="text-zinc-300">{e.event}</span>
                {e.status && <span className="text-zinc-600">status={e.status}</span>}
                {e.code && <span className="text-amber-500/80">code={e.code}</span>}
                {e.detail && <span className="text-zinc-600">{e.detail}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
