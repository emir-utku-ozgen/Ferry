import { StellarToml } from "@stellar/stellar-sdk";
import { ANCHOR_TIMEOUT_MS, toAnchorError } from "./anchorError";
import { assertAllowedAnchor } from "./anchorAllowlist";

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
  kycServer?: string;
  raw: StellarToml.Api.StellarToml;
}

const tomlCache = new Map<string, Promise<AnchorToml>>();

export async function resolveAnchorToml(domain: string): Promise<AnchorToml> {
  // Enforced first, before any outbound request is made — see
  // lib/stellar/anchorAllowlist.ts. This is the single choke point every
  // SEP module (10/24/31/38) and now 12 routes through.
  assertAllowedAnchor(domain);

  const cached = tomlCache.get(domain);
  if (cached) return cached;

  // TOML resolution is a plain GET, so it's safe to retry on connectivity
  // failures — same reasoning as anchorFetch's `retries` option, which the
  // SDK's own resolver doesn't expose, hence the manual loop here.
  const promise = resolveWithRetry(domain, 2)
    .then((raw) => ({
      signingKey: raw.SIGNING_KEY,
      webAuthEndpoint: raw.WEB_AUTH_ENDPOINT,
      transferServerSep24: raw.TRANSFER_SERVER_SEP0024,
      directPaymentServer: raw.DIRECT_PAYMENT_SERVER,
      anchorQuoteServer: raw.ANCHOR_QUOTE_SERVER,
      kycServer: raw.KYC_SERVER ?? raw.DIRECT_PAYMENT_SERVER,
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

// Plain-HTTP resolution is refused by default (`allowHttp: false` is the
// SDK's own safe default, and stays that way for every real domain). The
// one narrow exception is a `localhost`/`127.0.0.1` anchor domain — the
// only way to reach `mock-anchor/` (see its README), which has no TLS
// certificate of its own. This never weakens anything for a real anchor:
// a production domain never matches this check, so it's still refused
// over plain HTTP exactly as before.
function isLocalAnchorDomain(domain: string): boolean {
  const host = domain.split(":")[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

async function resolveWithRetry(domain: string, maxRetries: number): Promise<StellarToml.Api.StellarToml> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await StellarToml.Resolver.resolve(domain, {
        timeout: ANCHOR_TIMEOUT_MS,
        allowHttp: isLocalAnchorDomain(domain),
      });
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      const backoffMs = Math.min(250 * 2 ** attempt + Math.random() * 100, 4_000);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}
