"use client";

export type FlowErrorType = "quote_expired" | "anchor_rejected" | "invalid_recipient_details" | "kyc_rejected";

export interface FlowError {
  type: FlowErrorType;
  message: string;
}

export type KycStatus = "not_started" | "PROCESSING" | "NEEDS_INFO" | "ACCEPTED" | "REJECTED";

interface StatusTrackerProps {
  hasQuote: boolean;
  quoteExpired: boolean;
  kycStatus: KycStatus;
  transferStatus: string | null;
  error: FlowError | null;
}

const STEPS = [
  { key: "quote", label: "Quote Locked" },
  { key: "kyc", label: "KYC Verified" },
  { key: "deposit", label: "Deposit Initiated" },
  { key: "settled", label: "Settled in Lira" },
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

const ERROR_COPY: Record<FlowErrorType, { title: string; hint: string }> = {
  quote_expired: {
    title: "Quote expired",
    hint: "The locked rate is no longer valid. Return to the rate calculator and lock a fresh quote before continuing.",
  },
  anchor_rejected: {
    title: "Anchor rejected the request",
    hint: "The receiving anchor declined this transaction. See the message below for the anchor's stated reason.",
  },
  invalid_recipient_details: {
    title: "Recipient bank details rejected",
    hint: "The IBAN or bank account details the anchor received couldn't be validated. Reopen KYC and re-enter them.",
  },
  kyc_rejected: {
    title: "KYC verification rejected",
    hint: "The anchor rejected the submitted customer information. Review and resubmit in the KYC step.",
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
 * wallet/auth steps above it): Quote Locked → KYC Verified → Deposit
 * Initiated → Settled in Lira, plus a dedicated error screen for the
 * failure modes that can interrupt that path.
 */
export default function StatusTracker({ hasQuote, quoteExpired, kycStatus, transferStatus, error }: StatusTrackerProps) {
  const currentIndex = currentStepIndex(hasQuote, kycStatus, transferStatus);

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
        </div>
      )}
    </div>
  );
}
