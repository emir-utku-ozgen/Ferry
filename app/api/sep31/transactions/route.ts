import { NextRequest, NextResponse } from "next/server";
import { createSep31Transaction, getSep31Transaction, type Sep31TransactionRequest } from "@/lib/stellar/sep31";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { withInstrumentation } from "@/lib/apiInstrumentation";

/**
 * POST /api/sep31/transactions
 * Body: { domain, token, ...Sep31TransactionRequest }
 * Header: Idempotency-Key (optional) — a repeated call with the same key
 * replays the first response instead of creating a second anchor
 * transaction, which matters here specifically since this call is not
 * naturally safe to retry blindly.
 *
 * Creates a direct cross-border payment transaction with the receiving
 * anchor. Typically called after a SEP-38 firm quote has been obtained;
 * `quote_id` (if present) doubles as the audit-trail transfer identifier.
 */
export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep31-transactions-post");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  let raw: { domain?: string; token?: string; quote_id?: string; [key: string]: unknown };
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { domain, token, ...payload } = raw;
  if (!domain || !token) {
    return NextResponse.json({ error: "`domain` and `token` are required" }, { status: 400 });
  }

  return withInstrumentation(
    req,
    "sep31-transactions-post",
    "sep31.transaction.create_attempted",
    async () => {
      try {
        const transaction = await createSep31Transaction(domain, token, payload as unknown as Sep31TransactionRequest);
        return { status: 200, body: transaction };
      } catch (err) {
        return toApiErrorResponse(err, "Unknown SEP-31 error");
      }
    },
    typeof payload.quote_id === "string" ? payload.quote_id : undefined
  );
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
