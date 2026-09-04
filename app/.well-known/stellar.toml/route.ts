import { NextRequest, NextResponse } from "next/server";
import { Networks } from "@stellar/stellar-sdk";
import { EURC_ISSUER, getSigningKeypair, getTryIssuerKeypair, resolveMockAnchorBaseUrl } from "@/lib/mockAnchor/config";

/**
 * GET /.well-known/stellar.toml — SEP-1. Only ever served when this
 * deployment is actually acting as the embedded mock anchor (Ferry's own
 * orchestrator resolves this exact path for whichever domain
 * `NEXT_PUBLIC_ANCHOR_DOMAIN` points at — see lib/stellar/toml.ts). Ferry
 * itself never reads its own toml; this exists purely to be fetched by
 * Ferry's server-side SEP client code when `ANCHOR_DOMAIN` is this
 * deployment's own domain (`NEXT_PUBLIC_ENABLE_EMBEDDED_MOCK_ANCHOR=true`).
 *
 * Content mirrors mock-anchor/server.js's own stellar.toml template
 * exactly, with endpoint paths adjusted to this app's `/api/mock-anchor/*`
 * routing instead of a bare Express server's root-level routes.
 */
export async function GET(req: NextRequest) {
  const base = resolveMockAnchorBaseUrl(req);
  const [signingKeypair, tryIssuerKeypair] = await Promise.all([getSigningKeypair(), getTryIssuerKeypair()]);

  const toml = `VERSION="2.7.0"
NETWORK_PASSPHRASE="${Networks.TESTNET}"
SIGNING_KEY="${signingKeypair.publicKey()}"
WEB_AUTH_ENDPOINT="${base}/api/mock-anchor/auth"
DIRECT_PAYMENT_SERVER="${base}/api/mock-anchor/sep31"
ANCHOR_QUOTE_SERVER="${base}/api/mock-anchor/sep38"
KYC_SERVER="${base}/api/mock-anchor/sep12"

[DOCUMENTATION]
ORG_NAME="Ferry embedded mock anchor"
ORG_DESCRIPTION="Not a licensed anchor. Simulates the TRY leg of a EUR(EURC)->TRY corridor for Testnet-only development, embedded in Ferry's own Next.js deployment so it works on Vercel. See CORRIDOR_VERIFICATION.md."

[[CURRENCIES]]
code="EURC"
issuer="${EURC_ISSUER}"
is_asset_anchored=true
anchor_asset_type="fiat"
anchor_asset="EUR"
desc="Circle's real EURC on Stellar Testnet — see CORRIDOR_VERIFICATION.md for issuer verification."

[[CURRENCIES]]
code="TRY"
issuer="${tryIssuerKeypair.publicKey()}"
is_asset_anchored=true
anchor_asset_type="fiat"
anchor_asset="TRY"
desc="MOCK / SIMULATED representation of Turkish Lira. Not backed by any bank, not a real anchor. Exists only so this embedded test harness has a Stellar asset to quote and settle against."
`;

  return new NextResponse(toml, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
