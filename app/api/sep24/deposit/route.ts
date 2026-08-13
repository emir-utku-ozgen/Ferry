import { NextRequest, NextResponse } from "next/server";
import { initInteractiveDeposit } from "@/lib/stellar/sep24";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";

/**
 * POST /api/sep24/deposit
 * Body: { domain, token, asset_code, account, amount? }
 *
 * Opens a SEP-24 interactive deposit session. The returned `url` is meant
 * to be opened in a popup/iframe hosted entirely by the anchor — Ferry
 * never sees the KYC or funding details submitted there.
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

    const session = await initInteractiveDeposit(domain, token, { asset_code, account, amount });
    return NextResponse.json(session);
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-24 error");
    return NextResponse.json(body, { status });
  }
}
