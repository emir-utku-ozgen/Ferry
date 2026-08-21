import { NextRequest, NextResponse } from "next/server";
import { submitSignedChallenge } from "@/lib/stellar/sep10";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

/**
 * POST /api/sep10/token
 * Body: { domain: string, transaction: string }  // `transaction` is the
 * challenge XDR already signed client-side by Freighter.
 *
 * Exchanges the signed challenge for a SEP-10 JWT. The client keeps this
 * token in memory only — Ferry's server never persists it.
 */
export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep10-token");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  let domain: string | undefined;
  try {
    const parsed = await req.json();
    domain = parsed.domain;
    const { transaction } = parsed;
    if (!domain || !transaction) {
      return NextResponse.json({ error: "`domain` and `transaction` are required" }, { status: 400 });
    }

    const { token } = await submitSignedChallenge(domain, transaction);
    logger.info({ route: "sep10-token", event: "sep10.token.issued", status: 200, domain });
    return NextResponse.json({ token });
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-10 error");
    logger.error({ route: "sep10-token", event: "sep10.token.failed", status, code: body.code, domain, detail: body.error });
    return NextResponse.json(body, { status });
  }
}
