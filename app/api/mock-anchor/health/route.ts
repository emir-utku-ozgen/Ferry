import { NextResponse } from "next/server";
import { ensureSigningAccountFunded, getSigningKeypair, getTryIssuerKeypair } from "@/lib/mockAnchor/config";

/**
 * GET /api/mock-anchor/health — mirrors mock-anchor/server.js's own
 * `/health`. Not Ferry's own uptime endpoint (see `GET /api/health`,
 * lib/monitoring.ts) — this is the diagnostic tool for the embedded mock
 * anchor specifically: which signing key/TRY issuer this warm instance is
 * using, whether each secret is pinned, and whether the signing/receiving
 * account is actually funded and EURC-trusting on Testnet right now (the
 * one thing that needs live network I/O and can genuinely fail — see
 * ensureSigningAccountFunded()'s own docstring).
 */
export async function GET() {
  try {
    const signingKeypair = getSigningKeypair();
    const tryIssuerKeypair = getTryIssuerKeypair();
    const readiness = await ensureSigningAccountFunded();

    return NextResponse.json({
      ok: readiness.fundedAndTrusting,
      signing_key: signingKeypair.publicKey(),
      try_issuer: tryIssuerKeypair.publicKey(),
      signing_key_pinned: Boolean(process.env.MOCK_ANCHOR_SIGNING_SECRET),
      try_issuer_pinned: Boolean(process.env.MOCK_ANCHOR_TRY_ISSUER_SECRET),
      receiving_account_funded_and_trusting: readiness.fundedAndTrusting,
      ...(readiness.reason ? { receiving_account_issue: readiness.reason } : {}),
    });
  } catch (err) {
    console.error("[mock-anchor] /api/mock-anchor/health failed unexpectedly:", err);
    return NextResponse.json(
      { ok: false, error: `Health check failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
