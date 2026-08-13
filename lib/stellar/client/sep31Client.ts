import { parseJsonOrThrow } from "./http";

/** Browser-side calls into Ferry's `/api/sep31/*` orchestrator routes. */

export interface Sep31TransactionResult {
  id: string;
  stellar_account_id?: string;
  stellar_memo_type?: string;
  stellar_memo?: string;
  [key: string]: unknown;
}

export async function createSep31Transaction(
  domain: string,
  token: string,
  params: {
    amount: string;
    asset_code: string;
    quote_id?: string;
    funding_method?: string;
    fields?: Record<string, unknown>;
  }
): Promise<Sep31TransactionResult> {
  const res = await fetch("/api/sep31/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, token, ...params }),
  });
  return parseJsonOrThrow<Sep31TransactionResult>(res);
}
