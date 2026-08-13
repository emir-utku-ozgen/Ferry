import { NextRequest, NextResponse } from "next/server";
import { requestChallenge } from "@/lib/stellar/sep10";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

/**
 * POST /api/sep10/challenge
 * Body: { domain: string, account: string, homeDomain?: string }
 *
 * Orchestrator endpoint: proxies the SEP-10 challenge request to the given
 * anchor's WEB_AUTH_ENDPOINT server-side (avoids browser CORS issues) and
 * returns the unsigned challenge transaction for the client to sign locally
 * with Freighter. No key material passes through this route.
 *
 * `homeDomain` is only forwarded if the caller supplies it — many anchors
 * (including the public Stellar test anchor) reject a `home_domain` they
 * don't explicitly recognize, so omitting it is the safer default.
 */
export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep10-challenge");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    const { domain, account, homeDomain } = await req.json();
    if (!domain || !account) {
      return NextResponse.json({ error: "`domain` and `account` are required" }, { status: 400 });
    }

    const challenge = await requestChallenge(domain, account, homeDomain || undefined);
    return NextResponse.json(challenge);
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-10 error");
    return NextResponse.json(body, { status });
  }
}
