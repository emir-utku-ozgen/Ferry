import { NextResponse } from "next/server";
import { getSigningKeypair, getTryIssuerKeypair } from "@/lib/mockAnchor/config";

/**
 * GET /api/mock-anchor/health — mirrors mock-anchor/server.js's own
 * `/health`. Not Ferry's own uptime endpoint (see `GET /api/health`,
 * lib/monitoring.ts) — this reports the embedded mock anchor's own
 * identity, useful for confirming which signing key/TRY issuer this warm
 * instance is currently using (see config.ts's ephemeral-keypair caveat).
 */
export async function GET() {
  const [signingKeypair, tryIssuerKeypair] = await Promise.all([getSigningKeypair(), getTryIssuerKeypair()]);
  return NextResponse.json({
    ok: true,
    signing_key: signingKeypair.publicKey(),
    try_issuer: tryIssuerKeypair.publicKey(),
    signing_key_pinned: Boolean(process.env.MOCK_ANCHOR_SIGNING_SECRET),
    try_issuer_pinned: Boolean(process.env.MOCK_ANCHOR_TRY_ISSUER_SECRET),
  });
}
