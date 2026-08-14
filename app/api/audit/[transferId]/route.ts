import { NextRequest, NextResponse } from "next/server";
import { getAuditTrail } from "@/lib/auditTrail";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

/**
 * GET /api/audit/[transferId]
 *
 * Exposes the in-memory audit trail (lib/auditTrail.ts) for a single
 * transfer — every quote/KYC/deposit/transfer event recorded against its
 * SEP-38 quote id, in order. Powers the "Audit Trail" panel in
 * components/StatusTracker.tsx. Process-local and non-persistent, same
 * scope caveat as the rate limiter and idempotency cache — see the
 * module docstring in lib/auditTrail.ts.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ transferId: string }> }) {
  const rateLimit = checkRateLimit(req, "audit-get");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { transferId } = await params;
  const events = getAuditTrail(transferId);
  return NextResponse.json({ transferId, events });
}
