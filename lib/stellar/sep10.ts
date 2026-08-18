import { resolveAnchorToml } from "./toml";
import { anchorFetch, assertAnchorOk } from "./anchorFetch";
import { AnchorError } from "./anchorError";

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
    throw new AnchorError(
      "ANCHOR_REJECTED",
      `Anchor "${domain}" does not advertise a WEB_AUTH_ENDPOINT (SEP-10 unsupported)`
    );
  }

  const url = new URL(toml.webAuthEndpoint);
  url.searchParams.set("account", account);
  if (homeDomain) url.searchParams.set("home_domain", homeDomain);

  const context = `SEP-10 challenge request to "${domain}"`;
  // Retry-safe (a GET), and worth it specifically for a free-tier host
  // (e.g. Render) that spins down on inactivity — a connectivity failure
  // on the first attempt while it's waking up is exactly the case this
  // covers. Not a fix for a genuinely stale/unreachable deployment (that
  // fails the same way on every attempt), only for a transient blip.
  const res = await anchorFetch(url.toString(), { method: "GET" }, context, { retries: 2 });
  await assertAnchorOk(res, context);
  return res.json();
}

export async function submitSignedChallenge(
  domain: string,
  signedTransactionXdr: string
): Promise<Sep10TokenResponse> {
  const toml = await resolveAnchorToml(domain);
  if (!toml.webAuthEndpoint) {
    throw new AnchorError(
      "ANCHOR_REJECTED",
      `Anchor "${domain}" does not advertise a WEB_AUTH_ENDPOINT (SEP-10 unsupported)`
    );
  }

  const context = `SEP-10 token exchange with "${domain}"`;
  const res = await anchorFetch(
    toml.webAuthEndpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: signedTransactionXdr }),
    },
    context
  );
  await assertAnchorOk(res, context);
  return res.json();
}
