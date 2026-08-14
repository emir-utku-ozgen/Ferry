import { NextRequest, NextResponse } from "next/server";
import { initInteractiveWithdrawal } from "@/lib/stellar/sep24";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { withInstrumentation } from "@/lib/apiInstrumentation";

/**
 * POST /api/sep24/withdraw
 * Body: { domain, token, asset_code, account, amount?, transferId? }
 * Header: Idempotency-Key (optional) — see app/api/sep24/deposit/route.ts.
 *
 * Opens a SEP-24 interactive withdrawal session (anchor-hosted UI).
 */
export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep24-withdraw");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  let body: { domain?: string; token?: string; asset_code?: string; account?: string; amount?: string; transferId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { domain, token, asset_code, account, amount, transferId } = body;
  if (!domain || !token || !asset_code || !account) {
    return NextResponse.json(
      { error: "`domain`, `token`, `asset_code` and `account` are required" },
      { status: 400 }
    );
  }

  return withInstrumentation(
    req,
    "sep24-withdraw",
    "sep24.withdraw.initiated",
    async () => {
      try {
        const session = await initInteractiveWithdrawal(domain, token, { asset_code, account, amount });
        return { status: 200, body: session };
      } catch (err) {
        return toApiErrorResponse(err, "Unknown SEP-24 error");
      }
    },
    transferId
  );
}
