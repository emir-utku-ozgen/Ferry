import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { amountOutOfRange, EURC_ISSUER, getTryIssuerKeypair, MIN_EURC_AMOUNT, MAX_EURC_AMOUNT } from "@/lib/mockAnchor/config";
import { getEurTryRate } from "@/lib/mockAnchor/fxRate";

/**
 * GET /api/mock-anchor/sep38/price — unauthenticated indicative price.
 * Direct port of mock-anchor/server.js's `/sep38/price` handler: this mock
 * anchor only ever quotes EURC -> TRY, at the live EUR/TRY reference rate
 * from lib/mockAnchor/fxRate.ts (TRY itself is still a simulated asset) —
 * see CORRIDOR_VERIFICATION.md §5.
 */
export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "mock-anchor-sep38-price");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const params = req.nextUrl.searchParams;
  const sellAsset = params.get("sell_asset");
  const buyAsset = params.get("buy_asset");
  const sellAmountParam = params.get("sell_amount");
  const buyAmountParam = params.get("buy_amount");

  if (!sellAsset || !buyAsset || (!sellAmountParam && !buyAmountParam)) {
    return NextResponse.json(
      { error: "sell_asset, buy_asset and one of sell_amount/buy_amount are required" },
      { status: 400 }
    );
  }

  const tryIssuerKeypair = getTryIssuerKeypair();
  if (sellAsset !== `stellar:EURC:${EURC_ISSUER}` || buyAsset !== `stellar:TRY:${tryIssuerKeypair.publicKey()}`) {
    return NextResponse.json(
      { error: "sell_asset or buy_asset not found — this mock anchor only quotes EURC -> TRY" },
      { status: 404 }
    );
  }

  const fx = await getEurTryRate();
  const rate = fx.rate;
  const sellAmt = sellAmountParam ? Number(sellAmountParam) : Number(buyAmountParam) / rate;
  if (amountOutOfRange(sellAmt)) {
    return NextResponse.json(
      {
        error: sellAmt < MIN_EURC_AMOUNT ? "too_small" : "too_large",
        message: `sell_amount must be between ${MIN_EURC_AMOUNT} and ${MAX_EURC_AMOUNT} EURC`,
      },
      { status: 400 }
    );
  }

  const buyAmt = sellAmountParam ? Number(sellAmountParam) * rate : Number(buyAmountParam);
  const fee = (sellAmt * 0.005).toFixed(7);
  return NextResponse.json({
    price: rate.toFixed(7),
    sell_amount: sellAmt.toFixed(7),
    buy_amount: (buyAmt - Number(fee) * rate).toFixed(7),
    fee: { total: fee, asset: `stellar:EURC:${EURC_ISSUER}`, details: [{ name: "Mock anchor fee", amount: fee }] },
    rate_source: fx.source,
    rate_as_of: fx.asOf,
  });
}
