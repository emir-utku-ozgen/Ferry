import { StellarToml } from "@stellar/stellar-sdk";
import { ANCHOR_TIMEOUT_MS, toAnchorError } from "./anchorError";

/**
 * SEP-1 (stellar.toml) resolution.
 *
 * Every other SEP integration (10, 24, 31, 38) starts by discovering the
 * anchor's service endpoints and signing key from its stellar.toml file at
 * `https://{domain}/.well-known/stellar.toml`. Centralizing + caching that
 * lookup here keeps the individual SEP modules focused on their own flows.
 */

export interface AnchorToml {
  signingKey?: string;
  webAuthEndpoint?: string;
  transferServerSep24?: string;
  directPaymentServer?: string;
  anchorQuoteServer?: string;
  raw: StellarToml.Api.StellarToml;
}

const tomlCache = new Map<string, Promise<AnchorToml>>();

export async function resolveAnchorToml(domain: string): Promise<AnchorToml> {
  const cached = tomlCache.get(domain);
  if (cached) return cached;

  const promise = StellarToml.Resolver.resolve(domain, { timeout: ANCHOR_TIMEOUT_MS })
    .then((raw) => ({
      signingKey: raw.SIGNING_KEY,
      webAuthEndpoint: raw.WEB_AUTH_ENDPOINT,
      transferServerSep24: raw.TRANSFER_SERVER_SEP0024,
      directPaymentServer: raw.DIRECT_PAYMENT_SERVER,
      anchorQuoteServer: raw.ANCHOR_QUOTE_SERVER,
      raw,
    }))
    .catch((err) => {
      throw toAnchorError(err, `Resolving stellar.toml for "${domain}"`);
    });

  tomlCache.set(domain, promise);
  // Don't cache failures — let the caller retry on the next request.
  promise.catch(() => tomlCache.delete(domain));
  return promise;
}
