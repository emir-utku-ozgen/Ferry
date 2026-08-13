import { NextRequest, NextResponse } from "next/server";
import { submitSignedChallenge } from "@/lib/stellar/sep10";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

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

  try {
    const { domain, transaction } = await req.json();
    if (!domain || !transaction) {
      return NextResponse.json({ error: "`domain` and `transaction` are required" }, { status: 400 });
    }

    const { token } = await submitSignedChallenge(domain, transaction);
    return NextResponse.json({ token });
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-10 error");
    return NextResponse.json(body, { status });
  }
}
