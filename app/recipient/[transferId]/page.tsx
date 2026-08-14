"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { fetchCustomerInfo, submitCustomerInfo, type Sep12CustomerInfo } from "@/lib/stellar/client/sep12Client";
import { validateIban } from "@/lib/iban";

const RECEIVER_TYPE = "sep31-receiver";

/**
 * The recipient-facing link (GAP_ANALYSIS.md §4: "no recipient-specific
 * route... exists"). A sender shares a URL to this page after locking a
 * quote; the recipient — with no Stellar wallet and no prior relationship
 * with Ferry — enters their own name and IBAN here and it's relayed
 * straight to the anchor's SEP-12 KYC_SERVER, the same non-custodial
 * passthrough pattern as everywhere else in this codebase. Ferry stores
 * none of it; there is no database in this project to store it in.
 *
 * Known simplification, stated rather than hidden: this page authenticates
 * its SEP-12 PUT/GET calls using the *sender's* SEP-10 token, embedded in
 * the query string by whoever generated the share link. A production
 * version would mint a short-lived, receiver-scoped credential server-side
 * instead of passing the sender's own session token through a URL — that
 * requires a backend session store this Testnet prototype doesn't have.
 */
export default function RecipientPage() {
  const params = useParams<{ transferId: string }>();
  const searchParams = useSearchParams();

  const domain = searchParams.get("domain");
  const token = searchParams.get("token");
  const account = searchParams.get("account");
  const net = searchParams.get("net");
  const asset = searchParams.get("asset");

  const [customer, setCustomer] = useState<Sep12CustomerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const ibanResult = iban ? validateIban(iban) : null;
  const linkIncomplete = !domain || !token || !account;

  useEffect(() => {
    // `linkIncomplete` short-circuits the render below to a dedicated
    // error screen regardless of `loading`'s value, so there's nothing to
    // synchronously reset here — no fetch should start either.
    if (linkIncomplete) return;
    let cancelled = false;
    fetchCustomerInfo(domain, token, account, RECEIVER_TYPE)
      .then((info) => {
        if (!cancelled) setCustomer(info);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load this payment link");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [domain, token, account, linkIncomplete]);

  async function submit() {
    if (!domain || !token) return;
    if (!ibanResult?.valid) {
      setSubmitError(ibanResult?.reason ?? "Enter a valid IBAN.");
      return;
    }
    const [firstName, ...rest] = fullName.trim().split(/\s+/);
    if (!firstName || rest.length === 0) {
      setSubmitError("Enter your full first and last name.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitCustomerInfo(
        domain,
        token,
        {
          type: RECEIVER_TYPE,
          first_name: firstName,
          last_name: rest.join(" "),
          bank_account_number: ibanResult.normalized,
          ...(bankName ? { bank_name: bankName } : {}),
        },
        { transferId: params.transferId }
      );
      const refreshed = await fetchCustomerInfo(domain, token, account!, RECEIVER_TYPE);
      setCustomer(refreshed);
      void result;
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit your details");
    } finally {
      setSubmitting(false);
    }
  }

  if (linkIncomplete) {
    return (
      <RecipientShell>
        <p className="text-sm text-red-400">
          This link is missing information it needs (domain, sender session, or account). Ask the sender to
          resend it.
        </p>
      </RecipientShell>
    );
  }

  const hasBinaryFields = Object.values(customer?.fields ?? {}).some((f) => f.type === "binary");

  return (
    <RecipientShell>
      {net && (
        <div className="mb-6 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs text-zinc-500">You&apos;re receiving</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-300">
            {net} {asset ?? ""}
          </p>
          <p className="mt-1 text-[11px] text-zinc-600">As specified in the link the sender shared with you.</p>
        </div>
      )}

      {loading && <p className="text-xs text-zinc-500">Loading…</p>}
      {loadError && <p className="text-xs text-red-400">{loadError}</p>}

      {!loading && customer && (
        <>
          {customer.status === "ACCEPTED" ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-sm font-semibold text-emerald-300">You&apos;re verified</p>
              <p className="mt-1 text-xs text-zinc-500">
                The sender can now complete the payment — no further action needed here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {customer.status === "REJECTED" && (
                <p className="text-xs text-red-400">
                  {customer.message ?? "The anchor rejected these details. Correct and resubmit below."}
                </p>
              )}

              <label className="text-xs text-zinc-500">
                Full name
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ada Lovelace"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                />
              </label>

              <label className="text-xs text-zinc-500">
                IBAN
                <input
                  type="text"
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  placeholder="TR33 0006 1005 1978 6457 8413 26"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white outline-none focus:border-white/30"
                />
                {iban && ibanResult && !ibanResult.valid && (
                  <p className="mt-1 text-[11px] text-red-400">{ibanResult.reason}</p>
                )}
                {iban && ibanResult?.valid && <p className="mt-1 text-[11px] text-emerald-400">Valid IBAN format.</p>}
              </label>

              <label className="text-xs text-zinc-500">
                Bank name (optional)
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                />
              </label>

              {hasBinaryFields && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-200/80">
                  This anchor also requests a photo ID for full verification. Document upload isn&apos;t supported
                  by Ferry&apos;s current SEP-12 integration (text fields only) — a production integration would
                  submit this as a SEP-12 binary field or hand off to the anchor&apos;s own hosted verification
                  screen, if it offers one.
                </p>
              )}

              {submitError && <p className="text-xs text-red-400">{submitError}</p>}

              <button
                onClick={submit}
                disabled={submitting || !fullName || !iban}
                className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit my details"}
              </button>
            </div>
          )}
        </>
      )}

      <p className="mt-6 text-[11px] leading-relaxed text-zinc-600">
        Ferry never stores what you enter here — it goes directly to the receiving anchor&apos;s own verification
        service ({domain}).
      </p>
    </RecipientShell>
  );
}

function RecipientShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-8 py-16">
      <div className="mb-8 flex items-center gap-2">
        <span className="text-lg font-semibold tracking-tight text-white">Ferry</span>
        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          Recipient
        </span>
      </div>
      {children}
    </div>
  );
}
