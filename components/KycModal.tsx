"use client";

import { useEffect, useState } from "react";
import {
  fetchCustomerInfo,
  submitCustomerInfo,
  type Sep12CustomerInfo,
  type Sep12Status,
} from "@/lib/stellar/client/sep12Client";

interface KycModalProps {
  anchorDomain: string;
  publicKey: string;
  token: string;
  onClose: () => void;
  onStatusChange: (status: Sep12Status) => void;
}

// Always shown (SEP-31 senders): identity. Shown under "Bank / IBAN details"
// (relevant to a EUR → TRY payout corridor): recipient banking fields.
const REQUIRED_FIELD_ORDER = ["first_name", "last_name", "email_address"];
const BANK_FIELD_ORDER = ["bank_name", "bank_account_number", "bank_account_type", "bank_number"];

/**
 * SEP-12 Customer Info step. Ferry never stores what's entered here — every
 * field is relayed straight through to the anchor's own KYC_SERVER
 * (`/api/sep12/customer`), the same non-custodial handoff pattern as the
 * SEP-24 hosted UI.
 */
export default function KycModal({ anchorDomain, publicKey, token, onClose, onStatusChange }: KycModalProps) {
  const [customer, setCustomer] = useState<Sep12CustomerInfo | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCustomerInfo(anchorDomain, token, publicKey)
      .then((info) => {
        if (!cancelled) setCustomer(info);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load KYC requirements");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [anchorDomain, token, publicKey]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await submitCustomerInfo(anchorDomain, token, values);
      const refreshed = await fetchCustomerInfo(anchorDomain, token, publicKey);
      setCustomer(refreshed);
      onStatusChange(refreshed.status);
      if (refreshed.status === "ACCEPTED") onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit KYC details");
    } finally {
      setSubmitting(false);
    }
  }

  const fields = customer?.fields ?? {};
  const requiredFields = REQUIRED_FIELD_ORDER.filter((key) => key in fields);
  const bankFields = BANK_FIELD_ORDER.filter((key) => key in fields);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">SEP-12 Customer Info</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300" aria-label="Close">
            ✕
          </button>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
          Required by the receiving anchor before a SEP-31 payment can be created. This goes directly to the
          anchor&apos;s KYC service ({anchorDomain}) — Ferry relays it and stores none of it.
        </p>

        {loading && <p className="mt-4 text-xs text-zinc-500">Loading requirements…</p>}

        {!loading && customer && (
          <>
            {customer.status === "ACCEPTED" ? (
              <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                <p className="text-sm font-semibold text-emerald-300">KYC verified</p>
                <p className="mt-1 text-xs text-zinc-500">This account is cleared to send a SEP-31 payment.</p>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                {customer.status === "REJECTED" && (
                  <p className="text-xs text-red-400">
                    {customer.message ?? "The anchor rejected this customer record. Review and resubmit below."}
                  </p>
                )}

                <div className="flex flex-col gap-3">
                  <p className="text-xs font-semibold text-zinc-400">Identity</p>
                  {requiredFields.map((key) => (
                    <FieldInput key={key} name={key} field={fields[key]} value={values[key] ?? ""} onChange={setValues} />
                  ))}
                </div>

                {bankFields.length > 0 && (
                  <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
                    <p className="text-xs font-semibold text-zinc-400">Bank / IBAN details (recipient payout)</p>
                    {bankFields.map((key) => (
                      <FieldInput key={key} name={key} field={fields[key]} value={values[key] ?? ""} onChange={setValues} />
                    ))}
                  </div>
                )}

                {error && <p className="text-xs text-red-400">{error}</p>}

                <button
                  onClick={submit}
                  disabled={submitting}
                  className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "Submit KYC Details"}
                </button>
              </div>
            )}
          </>
        )}

        {!loading && !customer && error && <p className="mt-4 text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}

function FieldInput({
  name,
  field,
  value,
  onChange,
}: {
  name: string;
  field: { description: string; optional?: boolean; choices?: string[] };
  value: string;
  onChange: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
}) {
  const label = name
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

  return (
    <label className="text-xs text-zinc-500">
      {label}
      {!field.optional && <span className="text-red-400"> *</span>}
      {field.choices?.length ? (
        <select
          value={value}
          onChange={(e) => onChange((prev) => ({ ...prev, [name]: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
        >
          <option value="" disabled>
            Select…
          </option>
          {field.choices.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      ) : (
        <input
          type="text"
          value={value}
          placeholder={field.description}
          onChange={(e) => onChange((prev) => ({ ...prev, [name]: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
        />
      )}
    </label>
  );
}
