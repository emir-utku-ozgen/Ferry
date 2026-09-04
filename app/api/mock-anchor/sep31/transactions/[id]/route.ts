import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { verifyBearerToken } from "@/lib/mockAnchor/auth";
import { transactions } from "@/lib/mockAnchor/state";
import { checkAndSettleTransaction } from "@/lib/mockAnchor/checkSettlement";

/**
 * GET /api/mock-anchor/sep31/transactions/:id — polls transaction status.
 * Before responding, runs the on-demand settlement check (see
 * checkAndSettleTransaction) so this endpoint self-updates from
 * "pending_receiver" to "completed" the moment a real, memo-matched EURC
 * payment is found on Testnet — same status vocabulary
 * `components/StatusTracker.tsx` already recognizes.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rateLimit = checkRateLimit(req, "mock-anchor-sep31-status", { limit: 30 });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const auth = verifyBearerToken(req);
  if (!auth) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

  const { id } = await params;
  const tx = transactions.get(id);
  if (!tx) return NextResponse.json({ error: "Transaction not found" }, { status: 404 });

  await checkAndSettleTransaction(tx);
  return NextResponse.json({ transaction: tx });
}
