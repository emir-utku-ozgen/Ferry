import { NextRequest, NextResponse } from "next/server";
import { getTransactionStatus } from "@/lib/stellar/sep24";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

/**
 * GET /api/sep24/transaction?domain=...&token=...&id=...
 *
 * Polls the anchor for the current status of a SEP-24 transaction
 * (e.g. incomplete -> pending_user_transfer_start -> completed).
 *
 * Rate limited higher than the other orchestrator routes: TransferPanel
 * polls this on a 4s interval (up to 15 req/min) while a deposit or
 * withdrawal is in flight, so the default 10/min budget would trip our
 * own UI. 30/min leaves headroom above that legitimate cadence while
 * still bounding a scripted client from polling arbitrarily fast.
 */
export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep24-transaction", { limit: 30 });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  const token = searchParams.get("token");
  const id = searchParams.get("id");

  if (!domain || !token || !id) {
    return NextResponse.json({ error: "`domain`, `token` and `id` query params are required" }, { status: 400 });
  }

  try {
    const transaction = await getTransactionStatus(domain, token, id);
    return NextResponse.json(transaction);
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-24 error");
    return NextResponse.json(body, { status });
  }
}
