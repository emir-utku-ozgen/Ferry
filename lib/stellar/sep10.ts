import { resolveAnchorToml } from "./toml";

/**
 * SEP-10: Stellar Web Authentication.
 *
 * Flow:
 *   1. Client (browser) asks our API route for a challenge transaction.
 *   2. This module fetches that challenge from the anchor's WEB_AUTH_ENDPOINT.
 *   3. The browser signs the challenge with Freighter (private key never
 *      leaves the extension / never touches this server).
 *   4. The signed XDR is posted back to the anchor, which returns a JWT.
 *
 * This module only ever talks to the anchor — it never sees a secret key.
 */

export interface Sep10ChallengeResponse {
  transaction: string;
  network_passphrase?: string;
}

export interface Sep10TokenResponse {
  token: string;
}

export async function requestChallenge(
  domain: string,
  account: string,
  homeDomain?: string
): Promise<Sep10ChallengeResponse> {
  const toml = await resolveAnchorToml(domain);
  if (!toml.webAuthEndpoint) {
    throw new Error(`Anchor "${domain}" does not advertise a WEB_AUTH_ENDPOINT (SEP-10 unsupported)`);
  }

  const url = new URL(toml.webAuthEndpoint);
  url.searchParams.set("account", account);
  if (homeDomain) url.searchParams.set("home_domain", homeDomain);

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    throw new Error(`SEP-10 challenge request failed (${res.status}): ${await safeText(res)}`);
  }
  return res.json();
}

export async function submitSignedChallenge(
  domain: string,
  signedTransactionXdr: string
): Promise<Sep10TokenResponse> {
  const toml = await resolveAnchorToml(domain);
  if (!toml.webAuthEndpoint) {
    throw new Error(`Anchor "${domain}" does not advertise a WEB_AUTH_ENDPOINT (SEP-10 unsupported)`);
  }

  const res = await fetch(toml.webAuthEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: signedTransactionXdr }),
  });
  if (!res.ok) {
    throw new Error(`SEP-10 token exchange failed (${res.status}): ${await safeText(res)}`);
  }
  return res.json();
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
