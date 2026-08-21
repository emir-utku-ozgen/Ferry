import { Horizon, Networks } from "@stellar/stellar-sdk";

/**
 * Central Stellar network configuration for Ferry.
 * Strictly Testnet — every value here is read from env vars so the
 * app never has network parameters baked into application logic.
 */

export function isLocalHostname(hostname: string): boolean {
  const bare = hostname.toLowerCase();
  return bare === "localhost" || bare === "127.0.0.1";
}

/**
 * Unlike ANCHOR_DOMAIN below (which is deliberately scheme-optional — SEP-1
 * resolution always builds its own https://{domain}/.well-known/... URL),
 * Horizon's own SDK is passed this value verbatim and throws "Cannot
 * connect to insecure horizon server" if it resolves to anything other
 * than an https:// URL, unless `allowHttp` is explicitly set — which
 * getHorizonServer() below only ever does for localhost/127.0.0.1.
 * Normalizing a bare domain (e.g. NEXT_PUBLIC_HORIZON_URL set to
 * "horizon-testnet.stellar.org" without a scheme — an easy mistake given
 * ANCHOR_DOMAIN's own convention two lines below) here means that
 * misconfiguration recovers to the correct https:// URL instead of
 * throwing at Horizon.Server construction time.
 */
export function normalizeHorizonUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const hostname = trimmed.split(":")[0];
  return `${isLocalHostname(hostname) ? "http" : "https"}://${trimmed}`;
}

export const HORIZON_URL = normalizeHorizonUrl(
  process.env.NEXT_PUBLIC_HORIZON_URL || "https://horizon-testnet.stellar.org"
);

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || Networks.TESTNET;

/**
 * The domain Ferry itself is served from. Sent as `home_domain` during
 * SEP-10 challenge requests so anchors can bind the challenge to this app.
 */
export const HOME_DOMAIN =
  process.env.NEXT_PUBLIC_HOME_DOMAIN || "localhost:3000";

/**
 * Default anchor domain used to resolve stellar.toml (SEP-1) and discover
 * the WEB_AUTH_ENDPOINT / TRANSFER_SERVER_SEP0024 / DIRECT_PAYMENT_SERVER /
 * ANCHOR_QUOTE_SERVER endpoints for SEP-10/24/31/38.
 *
 * Tolerates a full URL (e.g. `http://localhost:4001`, for `mock-anchor/`
 * — see its README) as well as a bare domain — everything downstream
 * (the allowlist, SEP-1 resolution) expects a bare domain, so a scheme
 * prefix is stripped here rather than causing a malformed lookup later.
 * `lib/stellar/anchorAllowlist.ts`'s `assertAllowedAnchor()` does the same
 * normalization independently for any domain that reaches it a different
 * way (e.g. a hand-built `/claim/[id]` link) — this is the client-facing
 * copy of that same tolerance, not a substitute for it.
 */
export const ANCHOR_DOMAIN = (process.env.NEXT_PUBLIC_ANCHOR_DOMAIN || "testanchor.stellar.org")
  .trim()
  .replace(/^https?:\/\//i, "")
  .replace(/\/+$/, "");

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Circle's real EURC issuer on Stellar Testnet — Ferry's Stellar-native
 * representation of the EUR leg of the EUR->TRY corridor. Verified
 * independently against Circle's own developer docs and on-chain (see
 * CORRIDOR_VERIFICATION.md §5) — not a value to change casually, since a
 * wrong issuer here would silently point the UI at a worthless imposter
 * asset (anyone can issue an asset called "EURC" on Testnet).
 */
export const EURC_ISSUER =
  process.env.NEXT_PUBLIC_EURC_ISSUER || "GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO";

/**
 * Ferry's own mock TRY issuer (`mock-anchor/`) — a self-issued Testnet
 * asset simulating the TRY leg, since no public TRY-issuing anchor exists
 * on Testnet. NOT a real fiat-backed asset; see mock-anchor/README.md and
 * CORRIDOR_VERIFICATION.md §5 for exactly what this does and doesn't mean.
 * Only resolves to a *usable* asset when `NEXT_PUBLIC_ANCHOR_DOMAIN` is
 * also pointed at the mock anchor that issues it.
 */
export const MOCK_TRY_ISSUER =
  process.env.NEXT_PUBLIC_MOCK_TRY_ISSUER || "GADBO465IHRW3WNOCNM7H5UEXKER4TGT2FSBYUDHMKFOAYR2YHAQ72FZ";

let server: Horizon.Server | null = null;

/**
 * `allowHttp` is strictly scoped to localhost/127.0.0.1 (checked by
 * hostname, not by whether the URL string happens to start with
 * "http://") — a non-local HORIZON_URL never gets to opt into plain HTTP
 * even if someone configures one explicitly. Passing `allowHttp: true`
 * for an https:// URL is a harmless no-op (the SDK only consults it when
 * the protocol isn't already https), so this doesn't need to also check
 * HORIZON_URL's own scheme.
 */
export function isLocalHorizonUrl(url: string): boolean {
  try {
    return isLocalHostname(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Lazily-constructed singleton Horizon testnet client. */
export function getHorizonServer(): Horizon.Server {
  if (!server) {
    server = new Horizon.Server(HORIZON_URL, { allowHttp: isLocalHorizonUrl(HORIZON_URL) });
  }
  return server;
}
