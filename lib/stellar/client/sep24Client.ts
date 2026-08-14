import { parseJsonOrThrow } from "./http";

/** Browser-side calls into Ferry's `/api/sep24/*` orchestrator routes. */

export interface InteractiveSession {
  type: "interactive_customer_info_needed";
  url: string;
  id: string;
}

interface MutationOptions {
  /** Distinct per logical attempt — see app/api/sep24/deposit/route.ts. */
  idempotencyKey?: string;
  /** SEP-38 quote id, when one exists — correlates this call in the audit trail. */
  transferId?: string;
}

export async function startSep24Deposit(
  domain: string,
  token: string,
  params: { asset_code: string; account: string; amount?: string },
  options: MutationOptions = {}
): Promise<InteractiveSession> {
  const res = await fetch("/api/sep24/deposit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify({ domain, token, ...params, transferId: options.transferId }),
  });
  return parseJsonOrThrow<InteractiveSession>(res);
}

export async function startSep24Withdrawal(
  domain: string,
  token: string,
  params: { asset_code: string; account: string; amount?: string },
  options: MutationOptions = {}
): Promise<InteractiveSession> {
  const res = await fetch("/api/sep24/withdraw", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify({ domain, token, ...params, transferId: options.transferId }),
  });
  return parseJsonOrThrow<InteractiveSession>(res);
}

export interface Sep24TransactionStatus {
  id: string;
  kind?: string;
  status: string;
  status_eta?: number;
  more_info_url?: string;
  amount_in?: string;
  amount_out?: string;
  [key: string]: unknown;
}

export async function fetchSep24Transaction(
  domain: string,
  token: string,
  id: string,
  transferId?: string
): Promise<Sep24TransactionStatus> {
  const query = new URLSearchParams({ domain, token, id, ...(transferId ? { transferId } : {}) });
  const res = await fetch(`/api/sep24/transaction?${query.toString()}`);
  const { transaction } = await parseJsonOrThrow<{ transaction: Sep24TransactionStatus }>(res);
  return transaction;
}
