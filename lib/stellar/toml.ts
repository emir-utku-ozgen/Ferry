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

export interface AnchorCurrency {
  code?: string;
  issuer?: string;
}

export interface AnchorToml {
  signingKey?: string;
  webAuthEndpoint?: string;
  transferServerSep24?: string;
  directPaymentServer?: string;
  anchorQuoteServer?: string;
  kycServer?: string;
  /**
   * SEP-1's `[[CURRENCIES]]` list — each anchor's own published
   * `code`/`issuer` pairs. This is what makes an asset's identifier
   * *discoverable* rather than something the UI has to hardcode and hope
   * stays in sync with whichever anchor happens to be configured — see
   * `GET /api/anchor/currencies` and `lib/stellar/client/anchorClient.ts`'s
   * `findCurrencyAsset()`, used by `components/QuoteCalculator.tsx`.
   */
  currencies: AnchorCurrency[];
  raw: StellarToml.Api.StellarToml;
}

interface TomlCacheEntry {
  promise: Promise<AnchorToml>;
  storedAt: number;
}

const tomlCache = new Map<string, TomlCacheEntry>();

// A real anchor's published stellar.toml changes rarely, so caching it for
// a while avoids hammering it on every quote/auth call. mock-anchor/ is the
// opposite: it's meant to be restarted constantly during development, each
// time with a *different* signing key and TRY issuer unless its own `.env`
// pins one (see its README) — an unbounded cache here previously meant a
// long-running `next dev` process would keep serving a stale toml (and
// therefore a stale TRY issuer) indefinitely after a restart, surfacing as
// exactly the "this anchor doesn't support EURC → TRY" message even with
// the mock anchor demonstrably running. A short TTL for local domains
// specifically fixes that without touching real-anchor caching behavior.
const LOCAL_ANCHOR_TOML_TTL_MS = 15_000;
const REMOTE_ANCHOR_TOML_TTL_MS = 5 * 60_000;

export async function resolveAnchorToml(domainInput: string): Promise<AnchorToml> {
  // Enforced first, before any outbound request is made — see
  // lib/stellar/anchorAllowlist.ts. This is the single choke point every
  // SEP module (10/24/31/38) and now 12 routes through. Also normalizes
  // away a leading http(s):// scheme, if the caller passed one (e.g.
  // NEXT_PUBLIC_ANCHOR_DOMAIN=http://localhost:4001) — every use of
  // `domain` below uses this normalized form, not the original input.
  const domain = assertAllowedAnchor(domainInput);

  const ttlMs = isLocalAnchorDomain(domain) ? LOCAL_ANCHOR_TOML_TTL_MS : REMOTE_ANCHOR_TOML_TTL_MS;
  const cached = tomlCache.get(domain);
  if (cached && Date.now() - cached.storedAt < ttlMs) return cached.promise;

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
      currencies: raw.CURRENCIES ?? [],
      raw,
    }))
    .catch((err) => {
      throw toAnchorError(err, `Resolving stellar.toml for "${domain}"`);
    });

  tomlCache.set(domain, { promise, storedAt: Date.now() });
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
