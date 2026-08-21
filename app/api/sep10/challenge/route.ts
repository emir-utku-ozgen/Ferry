import { NextRequest, NextResponse } from "next/server";
import { requestChallenge } from "@/lib/stellar/sep10";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

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

  let domain: string | undefined;
  try {
    const parsed = await req.json();
    domain = parsed.domain;
    const { account, homeDomain } = parsed;
    if (!domain || !account) {
      return NextResponse.json({ error: "`domain` and `account` are required" }, { status: 400 });
    }

    const challenge = await requestChallenge(domain, account, homeDomain || undefined);
    logger.info({ route: "sep10-challenge", event: "sep10.challenge.issued", status: 200, domain });
    return NextResponse.json(challenge);
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-10 error");
    // `body.error` carries the full context string (e.g. `SEP-10 challenge
    // request to "anchor.example" failed: fetch failed`) — logging it, not
    // just `code`, is what turns "some SEP-10 call is failing" into "this
    // specific anchor domain is unreachable," visible directly in Vercel's
    // function logs without needing to reproduce the request by hand.
    logger.error({ route: "sep10-challenge", event: "sep10.challenge.failed", status, code: body.code, domain, detail: body.error });
    return NextResponse.json(body, { status });
  }
}
