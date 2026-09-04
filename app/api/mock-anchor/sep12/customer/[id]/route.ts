import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { verifyBearerToken } from "@/lib/mockAnchor/auth";
import { customers } from "@/lib/mockAnchor/state";

/**
 * DELETE /api/mock-anchor/sep12/customer/:id — removes a previously
 * submitted customer record. Ferry's own orchestrator route
 * (app/api/sep12/customer/route.ts) exposes this even though the current
 * UI never triggers it; implemented here for parity so a direct call
 * against the embedded anchor behaves the same as against any other.
 * `:id` is the Stellar account (mock-anchor/server.js keys records by
 * account, same as here) — every role for that account is cleared, since
 * SEP-12 DELETE has no `type` parameter to scope by role.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const rateLimit = checkRateLimit(req, "mock-anchor-sep12-delete");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const auth = verifyBearerToken(req);
  if (!auth) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

  const { id } = await params;
  for (const key of [...customers.keys()]) {
    if (key.startsWith(`${id}:`)) customers.delete(key);
  }
  return NextResponse.json({ ok: true });
}
