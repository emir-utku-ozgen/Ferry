import { parseJsonOrThrow } from "./http";

/** Browser-side calls into Ferry's `/api/sep24/*` orchestrator routes. */

export interface InteractiveSession {
  type: "interactive_customer_info_needed";
  url: string;
  id: string;
}

export async function startSep24Deposit(
  domain: string,
  token: string,
  params: { asset_code: string; account: string; amount?: string }
): Promise<InteractiveSession> {
  const res = await fetch("/api/sep24/deposit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, token, ...params }),
  });
  return parseJsonOrThrow<InteractiveSession>(res);
}

export async function startSep24Withdrawal(
  domain: string,
  token: string,
  params: { asset_code: string; account: string; amount?: string }
): Promise<InteractiveSession> {
  const res = await fetch("/api/sep24/withdraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, token, ...params }),
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
  id: string
): Promise<Sep24TransactionStatus> {
  const query = new URLSearchParams({ domain, token, id });
  const res = await fetch(`/api/sep24/transaction?${query.toString()}`);
  const { transaction } = await parseJsonOrThrow<{ transaction: Sep24TransactionStatus }>(res);
  return transaction;
}
