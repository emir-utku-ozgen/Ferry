import { parseJsonOrThrow } from "./http";

/** Browser-side calls into Ferry's `/api/sep10/*` orchestrator routes. */

export interface Sep10Challenge {
  transaction: string;
  network_passphrase?: string;
}

export async function fetchSep10Challenge(domain: string, account: string): Promise<Sep10Challenge> {
  const res = await fetch("/api/sep10/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, account }),
  });
  return parseJsonOrThrow<Sep10Challenge>(res);
}

export async function exchangeSep10Token(domain: string, signedTransactionXdr: string): Promise<string> {
  const res = await fetch("/api/sep10/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ domain, transaction: signedTransactionXdr }),
  });
  const { token } = await parseJsonOrThrow<{ token: string }>(res);
  return token;
}
