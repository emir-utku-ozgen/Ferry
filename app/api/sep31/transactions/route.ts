import { NextRequest, NextResponse } from "next/server";
import { createSep31Transaction, getSep31Transaction } from "@/lib/stellar/sep31";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

/**
 * POST /api/sep31/transactions
 * Body: { domain, token, ...Sep31TransactionRequest }
 *
 * Creates a direct cross-border payment transaction with the receiving
 * anchor. Typically called after a SEP-38 firm quote has been obtained.
 */
export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep31-transactions-post");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    const { domain, token, ...payload } = await req.json();
    if (!domain || !token) {
      return NextResponse.json({ error: "`domain` and `token` are required" }, { status: 400 });
    }

    const transaction = await createSep31Transaction(domain, token, payload);
    return NextResponse.json(transaction);
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-31 error");
    return NextResponse.json(body, { status });
  }
}

/**
 * GET /api/sep31/transactions?domain=...&token=...&id=...
 * Looks up the status of a previously created SEP-31 transaction.
 */
export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep31-transactions-get");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  const token = searchParams.get("token");
  const id = searchParams.get("id");

  if (!domain || !token || !id) {
    return NextResponse.json({ error: "`domain`, `token` and `id` query params are required" }, { status: 400 });
  }

  try {
    const transaction = await getSep31Transaction(domain, token, id);
    return NextResponse.json(transaction);
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-31 error");
    return NextResponse.json(body, { status });
  }
}
