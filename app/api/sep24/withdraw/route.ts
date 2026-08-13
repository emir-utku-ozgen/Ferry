import { NextRequest, NextResponse } from "next/server";
import { initInteractiveWithdrawal } from "@/lib/stellar/sep24";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";

/**
 * POST /api/sep24/withdraw
 * Body: { domain, token, asset_code, account, amount? }
 *
 * Opens a SEP-24 interactive withdrawal session (anchor-hosted UI).
 */
export async function POST(req: NextRequest) {
  try {
    const { domain, token, asset_code, account, amount } = await req.json();
    if (!domain || !token || !asset_code || !account) {
      return NextResponse.json(
        { error: "`domain`, `token`, `asset_code` and `account` are required" },
        { status: 400 }
      );
    }

    const session = await initInteractiveWithdrawal(domain, token, { asset_code, account, amount });
    return NextResponse.json(session);
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-24 error");
    return NextResponse.json(body, { status });
  }
}
