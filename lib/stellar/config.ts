import { Horizon, Networks } from "@stellar/stellar-sdk";

/**
 * Central Stellar network configuration for Ferry.
 * Strictly Testnet — every value here is read from env vars so the
 * app never has network parameters baked into application logic.
 */

export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL || "https://horizon-testnet.stellar.org";

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
 */
export const ANCHOR_DOMAIN =
  process.env.NEXT_PUBLIC_ANCHOR_DOMAIN || "testanchor.stellar.org";

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

/** Lazily-constructed singleton Horizon testnet client. */
export function getHorizonServer(): Horizon.Server {
  if (!server) {
    server = new Horizon.Server(HORIZON_URL, { allowHttp: HORIZON_URL.startsWith("http://") });
  }
  return server;
}
