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

function parseAllowlist(): Set<string> {
  const raw = process.env.ANCHOR_ALLOWLIST;
  const domains = raw
    ? raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ALLOWLIST;
  return new Set(domains);
}

const allowlist = parseAllowlist();

export function assertAllowedAnchor(domain: string): void {
  if (!allowlist.has(domain.toLowerCase())) {
    throw new AnchorError(
      "ANCHOR_REJECTED",
      `Anchor domain "${domain}" is not on Ferry's allowlist. Configure ANCHOR_ALLOWLIST to add trusted anchors.`
    );
  }
}
