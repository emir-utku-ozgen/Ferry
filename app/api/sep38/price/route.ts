import { NextRequest, NextResponse } from "next/server";
import { getIndicativePrice } from "@/lib/stellar/sep38";

/**
 * GET /api/sep38/price?domain=...&sell_asset=...&buy_asset=...&sell_amount=...&context=sep24
 *
 * Unauthenticated indicative price lookup — powers the quote calculator's
 * live rate preview before the user connects a wallet.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  const sell_asset = searchParams.get("sell_asset");
  const buy_asset = searchParams.get("buy_asset");
  const sell_amount = searchParams.get("sell_amount") ?? undefined;
  const buy_amount = searchParams.get("buy_amount") ?? undefined;
  const context = (searchParams.get("context") as "sep31" | "sep24") ?? "sep24";

  if (!domain || !sell_asset || !buy_asset || (!sell_amount && !buy_amount)) {
    return NextResponse.json(
      { error: "`domain`, `sell_asset`, `buy_asset` and one of `sell_amount`/`buy_amount` are required" },
      { status: 400 }
    );
  }

  try {
    const price = await getIndicativePrice(domain, {
      sell_asset,
      buy_asset,
      sell_amount,
      buy_amount,
      context,
    });
    return NextResponse.json(price);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown SEP-38 error" },
      { status: 502 }
    );
  }
}
