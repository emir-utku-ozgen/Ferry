import { NextRequest, NextResponse } from "next/server";
import { postFirmQuote } from "@/lib/stellar/sep38";

/**
 * POST /api/sep38/quote
 * Body: { domain, token, ...FirmQuoteRequest }
 *
 * Requests a firm, executable, time-limited quote from the anchor (requires
 * a SEP-10 session token). The returned quote id is passed along to the
 * SEP-24/31 transfer step to lock in the rate.
 */
export async function POST(req: NextRequest) {
  try {
    const { domain, token, ...payload } = await req.json();
    if (!domain || !token) {
      return NextResponse.json({ error: "`domain` and `token` are required" }, { status: 400 });
    }

    const quote = await postFirmQuote(domain, token, payload);
    return NextResponse.json(quote);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown SEP-38 error" },
      { status: 502 }
    );
  }
}
