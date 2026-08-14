import { NextRequest, NextResponse } from "next/server";
import { initInteractiveDeposit } from "@/lib/stellar/sep24";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { withInstrumentation } from "@/lib/apiInstrumentation";

/**
 * POST /api/sep24/deposit
 * Body: { domain, token, asset_code, account, amount?, transferId? }
 * Header: Idempotency-Key (optional) — a repeated call with the same key
 * replays the first response instead of opening a second anchor session.
 *
 * Opens a SEP-24 interactive deposit session. The returned `url` is meant
 * to be opened in a popup/iframe hosted entirely by the anchor — Ferry
 * never sees the KYC or funding details submitted there.
 */
export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep24-deposit");
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
    "sep24-deposit",
    "sep24.deposit.initiated",
    async () => {
      try {
        const session = await initInteractiveDeposit(domain, token, { asset_code, account, amount });
        return { status: 200, body: session };
      } catch (err) {
        return toApiErrorResponse(err, "Unknown SEP-24 error");
      }
    },
    transferId
  );
}
