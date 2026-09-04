import { NextRequest, NextResponse } from "next/server";
import { Networks, WebAuth } from "@stellar/stellar-sdk";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { getSigningKeypair, resolveMockAnchorBaseUrl } from "@/lib/mockAnchor/config";
import { issueBearerToken } from "@/lib/mockAnchor/auth";

/** Bare domain (no scheme) this request was reached at — the mock anchor's own SEP-10 home domain. */
function homeDomainFor(req: NextRequest): string {
  return resolveMockAnchorBaseUrl(req).replace(/^https?:\/\//i, "");
}

/**
 * GET /api/mock-anchor/auth?account=... — SEP-10 challenge issuance.
 * POST /api/mock-anchor/auth — SEP-10 signed-challenge -> JWT exchange.
 *
 * Direct TypeScript port of mock-anchor/server.js's `/auth` GET+POST
 * handlers, using the same @stellar/stellar-sdk `WebAuth` helpers a real
 * anchor would. Same stated simplification as the original: trusts
 * `WebAuth.readChallengeTx`'s structural validation (right domain, right
 * server key, right timebounds) without separately re-deriving on-chain
 * signer thresholds — adequate for a Testnet-only mock, not a real anchor.
 */
export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "mock-anchor-auth-challenge");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const account = req.nextUrl.searchParams.get("account");
  if (!account) return NextResponse.json({ error: "`account` is required" }, { status: 400 });

  try {
    const signingKeypair = getSigningKeypair();
    const homeDomain = homeDomainFor(req);
    const transaction = WebAuth.buildChallengeTx(
      signingKeypair,
      account,
      homeDomain,
      300,
      Networks.TESTNET,
      homeDomain
    );
    return NextResponse.json({ transaction, network_passphrase: Networks.TESTNET });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to build challenge";
    return NextResponse.json({ error: `Failed to build challenge: ${message}` }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "mock-anchor-auth-token");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  let transaction: string | undefined;
  try {
    const body = await req.json();
    transaction = body?.transaction;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!transaction) return NextResponse.json({ error: "`transaction` is required" }, { status: 400 });

  try {
    const signingKeypair = getSigningKeypair();
    const homeDomain = homeDomainFor(req);
    const { clientAccountID } = WebAuth.readChallengeTx(
      transaction,
      signingKeypair.publicKey(),
      Networks.TESTNET,
      homeDomain,
      homeDomain
    );
    const token = issueBearerToken(clientAccountID, homeDomain);
    return NextResponse.json({ token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid challenge transaction";
    return NextResponse.json({ error: `Invalid challenge transaction: ${message}` }, { status: 400 });
  }
}
