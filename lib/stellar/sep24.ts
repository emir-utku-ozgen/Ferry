import { resolveAnchorToml } from "./toml";

/**
 * SEP-24: Hosted Deposit and Withdrawal.
 *
 * Ferry never renders the anchor's KYC/payment UI itself — it opens the
 * anchor-hosted interactive URL returned here (e.g. in a popup/iframe),
 * keeping identity documents and payment details with the licensed anchor
 * at all times (non-custodial by construction).
 */

export interface InteractiveTransferResponse {
  type: "interactive_customer_info_needed";
  url: string;
  id: string;
}

export interface Sep24TransactionParams {
  asset_code: string;
  account: string;
  amount?: string;
  lang?: string;
}

async function transferServer(domain: string): Promise<string> {
  const toml = await resolveAnchorToml(domain);
  if (!toml.transferServerSep24) {
    throw new Error(`Anchor "${domain}" does not advertise a TRANSFER_SERVER_SEP0024 (SEP-24 unsupported)`);
  }
  return toml.transferServerSep24;
}

async function postInteractive(
  endpoint: string,
  token: string,
  params: Sep24TransactionParams
): Promise<InteractiveTransferResponse> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`SEP-24 interactive request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

export async function initInteractiveDeposit(
  domain: string,
  token: string,
  params: Sep24TransactionParams
): Promise<InteractiveTransferResponse> {
  const base = await transferServer(domain);
  return postInteractive(`${base}/transactions/deposit/interactive`, token, params);
}

export async function initInteractiveWithdrawal(
  domain: string,
  token: string,
  params: Sep24TransactionParams
): Promise<InteractiveTransferResponse> {
  const base = await transferServer(domain);
  return postInteractive(`${base}/transactions/withdraw/interactive`, token, params);
}

export async function getTransactionStatus(
  domain: string,
  token: string,
  id: string
): Promise<Record<string, unknown>> {
  const base = await transferServer(domain);
  const url = new URL(`${base}/transaction`);
  url.searchParams.set("id", id);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`SEP-24 transaction status request failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}
