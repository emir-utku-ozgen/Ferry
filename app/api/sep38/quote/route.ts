import { NextRequest, NextResponse } from "next/server";
import { postFirmQuote } from "@/lib/stellar/sep38";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { recordAuditEvent } from "@/lib/auditTrail";

/**
 * POST /api/sep38/quote
 * Body: { domain, token, ...FirmQuoteRequest }
 *
 * Requests a firm, executable, time-limited quote from the anchor (requires
 * a SEP-10 session token). The returned quote id is passed along to the
 * SEP-24/31 transfer step to lock in the rate.
 */
export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep38-quote");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    const { domain, token, ...payload } = await req.json();
    if (!domain || !token) {
      return NextResponse.json({ error: "`domain` and `token` are required" }, { status: 400 });
    }

    const quote = await postFirmQuote(domain, token, payload);
    // The quote id is the first stable identifier in the flow — it becomes
    // the `transferId` every subsequent KYC/deposit/transfer event
    // correlates against in the audit trail (GET /api/audit/[transferId]).
    logger.info({ route: "sep38-quote", event: "sep38.quote.locked", transferId: quote.id, status: 200 });
    recordAuditEvent(quote.id, "quote.locked", { detail: `${quote.sell_amount} ${quote.sell_asset} -> ${quote.buy_amount} ${quote.buy_asset}` });
    return NextResponse.json(quote);
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-38 error");
    logger.error({ route: "sep38-quote", event: "sep38.quote.failed", status, code: body.code });
    return NextResponse.json(body, { status });
  }
}
