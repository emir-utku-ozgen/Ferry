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

let server: Horizon.Server | null = null;

/** Lazily-constructed singleton Horizon testnet client. */
export function getHorizonServer(): Horizon.Server {
  if (!server) {
    server = new Horizon.Server(HORIZON_URL, { allowHttp: HORIZON_URL.startsWith("http://") });
  }
  return server;
}
