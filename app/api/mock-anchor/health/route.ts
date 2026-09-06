import { NextRequest, NextResponse } from "next/server";
import { ensureSigningAccountFunded, getSigningKeypair, getTryIssuerKeypair, resolveMockAnchorBaseUrl } from "@/lib/mockAnchor/config";

/**
 * GET /api/mock-anchor/health — mirrors mock-anchor/server.js's own
 * `/health`. Not Ferry's own uptime endpoint (see `GET /api/health`,
 * lib/monitoring.ts) — this is the diagnostic tool for the embedded mock
 * anchor specifically: which signing key/TRY issuer this warm instance is
 * using, whether each secret is pinned, and whether the signing/receiving
 * account is actually funded and EURC-trusting on Testnet right now (the
 * one thing that needs live network I/O and can genuinely fail — see
 * ensureSigningAccountFunded()'s own docstring).
 *
 * Temporary addition: `debug_base_url` block, to pin down a live bug where
 * stellar.toml's endpoint URLs come back wrapped as
 * `[https://...](https://...)`. Confirmed real (not a rendering artifact —
 * checked via curl, Node's own fetch, and a WebFetch call from an
 * unrelated network path, all identical; the actual route source has no
 * bracket characters anywhere) but not yet explained after two clean,
 * cache-free rebuilds with a verified-clean NEXT_PUBLIC_APP_URL. This
 * echoes every raw signal resolveMockAnchorBaseUrl() reads, plus char
 * codes, so a hidden/invisible character or a value differing from what
 * the dashboard displays is directly visible instead of guessed at.
 */
export async function GET(req: NextRequest) {
  try {
    const signingKeypair = getSigningKeypair();
    const tryIssuerKeypair = getTryIssuerKeypair();
    const readiness = await ensureSigningAccountFunded();
    const resolvedBaseUrl = resolveMockAnchorBaseUrl(req);

    return NextResponse.json({
      ok: readiness.fundedAndTrusting,
      signing_key: signingKeypair.publicKey(),
      try_issuer: tryIssuerKeypair.publicKey(),
      signing_key_pinned: Boolean(process.env.MOCK_ANCHOR_SIGNING_SECRET),
      try_issuer_pinned: Boolean(process.env.MOCK_ANCHOR_TRY_ISSUER_SECRET),
      receiving_account_funded_and_trusting: readiness.fundedAndTrusting,
      ...(readiness.reason ? { receiving_account_issue: readiness.reason } : {}),
      debug_base_url: {
        resolved: resolvedBaseUrl,
        resolved_char_codes_first_80: [...resolvedBaseUrl.slice(0, 80)].map((c) => c.charCodeAt(0)),
        raw_NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? null,
        raw_VERCEL_URL: process.env.VERCEL_URL ?? null,
        raw_VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? null,
        request_host_header: req.headers.get("host"),
        request_x_forwarded_proto: req.headers.get("x-forwarded-proto"),
      },
    });
  } catch (err) {
    console.error("[mock-anchor] /api/mock-anchor/health failed unexpectedly:", err);
    return NextResponse.json(
      { ok: false, error: `Health check failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
