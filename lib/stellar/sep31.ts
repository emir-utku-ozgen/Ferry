import { resolveAnchorToml } from "./toml";

/**
 * SEP-31: Cross-Border Payments API.
 *
 * Used for direct receiving-anchor payouts (sending-anchor-to-receiving-anchor
 * remittances), as opposed to SEP-24's hosted deposit/withdrawal UI. The
 * receiving anchor still owns all KYC — Ferry only orchestrates the
 * transaction handshake and passes along the SEP-38 quote id.
 */

export interface Sep31Info {
  receive: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Sep31TransactionRequest {
  amount: string;
  asset_code: string;
  quote_id?: string;
  sender_id?: string;
  receiver_id?: string;
  fields?: Record<string, unknown>;
}

export interface Sep31TransactionResponse {
  id: string;
  stellar_account_id: string;
  stellar_memo_type?: string;
  stellar_memo?: string;
}

async function directPaymentServer(domain: string): Promise<string> {
  const toml = await resolveAnchorToml(domain);
  if (!toml.directPaymentServer) {
    throw new Error(`Anchor "${domain}" does not advertise a DIRECT_PAYMENT_SERVER (SEP-31 unsupported)`);
  }
  return toml.directPaymentServer;
}

export async function getSep31Info(domain: string, token: string): Promise<Sep31Info> {
  const base = await directPaymentServer(domain);
  const res = await fetch(`${base}/info`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`SEP-31 info request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function createSep31Transaction(
  domain: string,
  token: string,
  payload: Sep31TransactionRequest
): Promise<Sep31TransactionResponse> {
  const base = await directPaymentServer(domain);
  const res = await fetch(`${base}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`SEP-31 transaction creation failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function getSep31Transaction(
  domain: string,
  token: string,
  id: string
): Promise<Record<string, unknown>> {
  const base = await directPaymentServer(domain);
  const res = await fetch(`${base}/transactions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`SEP-31 transaction lookup failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}
