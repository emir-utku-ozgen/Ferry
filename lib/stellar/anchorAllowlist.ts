import { AnchorError } from "./anchorError";

/**
 * Anchor domain allowlist.
 *
 * Every `/api/sep{10,24,31,38}/*` route accepts a client-supplied `domain`
 * and resolves it server-side via SEP-1. Without a check, that makes Ferry
 * an unauthenticated proxy for fetching/probing any host an attacker
 * chooses (SSRF / open relay), regardless of what the UI itself sends —
 * concretely: `app/claim/[id]/page.tsx` reads `domain` straight from the
 * URL query string, so a hand-crafted claim link is genuinely
 * attacker-controlled input, not just a UI convenience.
 *
 * `resolveAnchorToml()` calls `assertAllowedAnchor()` before ever issuing
 * an outbound request, so this is enforced once, centrally, for all SEPs.
 *
 * Configure via `ANCHOR_ALLOWLIST` (comma-separated domains). Defaults to
 * just the public Stellar reference anchor used throughout local/Testnet
 * development.
 *
 * Deliberately self-contained: does NOT import EMBEDDED_MOCK_ANCHOR_ENABLED
 * or ANCHOR_DOMAIN from ./config. That module is shared by client code
 * (app/page.tsx) as well as server code, and a live Vercel deployment was
 * observed serving a *different* value of those NEXT_PUBLIC_-derived
 * constants to this file than to the statically-rendered page — plausible
 * cause never fully confirmed (Vercel env-var propagation across a
 * multi-function deployment is opaque from here), but this file doesn't
 * need to depend on it either way: every signal below is read directly
 * from `process.env` inside `buildAllowlist()`, called fresh on every
 * `assertAllowedAnchor()` invocation rather than cached in a module-level
 * constant computed once at cold start. This removes the entire class of
 * "wrong value frozen at import time" risk, whatever its root cause.
 *
 * What this deliberately does NOT do, even though it would also "fix" the
 * symptom: auto-allow any `*.vercel.app` domain, or any domain matching
 * the current request's own `Host` header. Both would reopen the exact
 * SSRF hole this file exists to close — `*.vercel.app` is a shared public
 * namespace anyone can deploy to for free, and the claim-link attack
 * surface above is precisely "attacker supplies an arbitrary domain,
 * hoping Ferry's server treats it as trusted." Only this deployment's own,
 * server-configured domain(s) are ever auto-allowed — see ownDomains().
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

/**
 * Whether this deployment is acting as the embedded mock anchor. Reads
 * both a server-only `ENABLE_EMBEDDED_MOCK_ANCHOR` and the
 * `NEXT_PUBLIC_`-prefixed equivalent — the server-only variant is
 * guaranteed available to this file (a pure server module, never bundled
 * for the browser) without any NEXT_PUBLIC_ build-time-inlining
 * involved at all, so it's the more reliable one to set if the
 * NEXT_PUBLIC_ version isn't taking effect for whatever reason.
 */
function isEmbeddedMockAnchorEnabled(): boolean {
  return process.env.ENABLE_EMBEDDED_MOCK_ANCHOR === "true" || process.env.NEXT_PUBLIC_ENABLE_EMBEDDED_MOCK_ANCHOR === "true";
}

/**
 * This deployment's own domain(s) — every server-configured signal Vercel
 * (or an operator) provides, so the embedded mock anchor is reachable
 * without requiring `ANCHOR_ALLOWLIST` to separately list it. Every value
 * here is either something Vercel itself sets automatically
 * (`VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`) or something an
 * operator explicitly configured (`NEXT_PUBLIC_APP_URL`) — never derived
 * from anything a request/client supplies, which is what keeps this safe:
 * an attacker's claim link can say `domain=` anything it wants, but it
 * can't change what this server's own environment variables say about
 * itself.
 */
function ownDomains(): string[] {
  const domains = new Set<string>();
  for (const raw of [process.env.NEXT_PUBLIC_APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]) {
    if (raw) domains.add(normalizeAnchorDomain(raw).toLowerCase());
  }
  return [...domains];
}

function buildAllowlist(): Set<string> {
  const raw = process.env.ANCHOR_ALLOWLIST;
  const domains = raw
    ? raw.split(",").map((d) => normalizeAnchorDomain(d).toLowerCase()).filter(Boolean)
    : DEFAULT_ALLOWLIST;
  const allowlist = new Set(domains);

  // When this deployment is itself acting as the anchor, its own domain(s)
  // must be allowed regardless of what ANCHOR_ALLOWLIST was (or wasn't)
  // explicitly set to — otherwise the embedded anchor is unreachable by
  // default and every operator would need to remember to add themselves
  // to their own allowlist, exactly the kind of footgun this file exists
  // to prevent for everyone else's domain.
  if (isEmbeddedMockAnchorEnabled()) {
    for (const domain of ownDomains()) allowlist.add(domain);
  }

  return allowlist;
}

/** Returns the normalized domain on success — callers should use this value, not their original input, for everything downstream. */
export function assertAllowedAnchor(domain: string): string {
  const normalized = normalizeAnchorDomain(domain);
  // Built fresh on every call, not cached — see this file's module
  // docstring for why. process.env reads are cheap; there's no
  // performance reason to cache this, only a correctness risk.
  const allowlist = buildAllowlist();
  if (!allowlist.has(normalized.toLowerCase())) {
    throw new AnchorError(
      "ANCHOR_REJECTED",
      `Anchor domain "${domain}" is not on Ferry's allowlist. Configure ANCHOR_ALLOWLIST to add trusted anchors.`
    );
  }
  return normalized;
}
