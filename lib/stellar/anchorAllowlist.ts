import { AnchorError } from "./anchorError";

/**
 * Anchor domain allowlist.
 *
 * Every `/api/sep{10,24,31,38}/*` route accepts a client-supplied `domain`
 * and resolves it server-side via SEP-1. Without a check, that makes Ferry
 * an unauthenticated proxy for fetching/probing any host an attacker
 * chooses (SSRF / open relay), regardless of what the UI itself sends.
 * `resolveAnchorToml()` calls `assertAllowedAnchor()` before ever issuing
 * an outbound request, so this is enforced once, centrally, for all SEPs.
 *
 * Configure via `ANCHOR_ALLOWLIST` (comma-separated domains). Defaults to
 * just the public Stellar reference anchor used throughout local/Testnet
 * development.
 */

const DEFAULT_ALLOWLIST = ["testanchor.stellar.org"];

/**
 * Strips a leading `http://`/`https://` scheme and any trailing slash, so
 * `http://localhost:4001`, `http://localhost:4001/`, and `localhost:4001`
 * all resolve to the same bare domain everything downstream (the
 * allowlist, SEP-1 TOML resolution, `NEXT_PUBLIC_HOME_DOMAIN` comparisons)
 * expects. Anchors are configured and compared by domain, not by URL —
 * this is the one place that forgives someone pasting a full URL instead.
 */
export function normalizeAnchorDomain(domain: string): string {
  return domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function parseAllowlist(): Set<string> {
  const raw = process.env.ANCHOR_ALLOWLIST;
  const domains = raw
    ? raw.split(",").map((d) => normalizeAnchorDomain(d).toLowerCase()).filter(Boolean)
    : DEFAULT_ALLOWLIST;
  return new Set(domains);
}

const allowlist = parseAllowlist();

/** Returns the normalized domain on success — callers should use this value, not their original input, for everything downstream. */
export function assertAllowedAnchor(domain: string): string {
  const normalized = normalizeAnchorDomain(domain);
  if (!allowlist.has(normalized.toLowerCase())) {
    throw new AnchorError(
      "ANCHOR_REJECTED",
      `Anchor domain "${domain}" is not on Ferry's allowlist. Configure ANCHOR_ALLOWLIST to add trusted anchors.`
    );
  }
  return normalized;
}
