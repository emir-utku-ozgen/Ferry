import { NextRequest, NextResponse } from "next/server";
import { getTransactionStatus } from "@/lib/stellar/sep24";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { recordAuditEvent } from "@/lib/auditTrail";

/**
 * GET /api/sep24/transaction?domain=...&token=...&id=...&transferId=...
 *
 * Polls the anchor for the current status of a SEP-24 transaction
 * (e.g. incomplete -> pending_user_transfer_start -> completed). Each
 * poll's status is recorded in the audit trail under `transferId` (the
 * locked SEP-38 quote id, when one exists) so the transaction's full
 * state history is inspectable via GET /api/audit/[transferId] — not
 * logged individually via console, since a 4s poll loop would flood
 * stdout with mostly-unchanged status; the audit trail is the right
 * granularity for this one.
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
  const transferId = searchParams.get("transferId") ?? id ?? undefined;

  if (!domain || !token || !id) {
    return NextResponse.json({ error: "`domain`, `token` and `id` query params are required" }, { status: 400 });
  }

  try {
    const transaction = await getTransactionStatus(domain, token, id);
    if (transferId) {
      recordAuditEvent(transferId, "sep24.transaction.polled", { status: String(transaction.status ?? "") });
    }
    return NextResponse.json(transaction);
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-24 error");
    return NextResponse.json(body, { status });
  }
}
