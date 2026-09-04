import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { verifyBearerToken } from "@/lib/mockAnchor/auth";
import { amountOutOfRange, EURC_ISSUER, getTryIssuerKeypair, MIN_EURC_AMOUNT, MAX_EURC_AMOUNT, MOCK_EURC_TRY_RATE } from "@/lib/mockAnchor/config";
import { quotes, type MockQuote } from "@/lib/mockAnchor/state";

/**
 * POST /api/mock-anchor/sep38/quote — firm, executable, time-limited quote
 * (requires a SEP-10 session). Direct port of mock-anchor/server.js's
 * `/sep38/quote` handler — same 5-minute validity window, same 0.5% mock fee.
 */
export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "mock-anchor-sep38-quote");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const auth = verifyBearerToken(req);
  if (!auth) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

  let body: { sell_asset?: string; buy_asset?: string; sell_amount?: string; buy_amount?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { sell_asset: sellAsset, buy_asset: buyAsset, sell_amount: sellAmountParam, buy_amount: buyAmountParam } = body;

  const tryIssuerKeypair = getTryIssuerKeypair();
  if (sellAsset !== `stellar:EURC:${EURC_ISSUER}` || buyAsset !== `stellar:TRY:${tryIssuerKeypair.publicKey()}`) {
    return NextResponse.json(
      { error: "sell_asset or buy_asset not found — this mock anchor only quotes EURC -> TRY" },
      { status: 404 }
    );
  }

  const sellAmt = sellAmountParam ? Number(sellAmountParam) : Number(buyAmountParam) / MOCK_EURC_TRY_RATE;
  if (amountOutOfRange(sellAmt)) {
    return NextResponse.json(
      {
        error: sellAmt < MIN_EURC_AMOUNT ? "too_small" : "too_large",
        message: `sell_amount must be between ${MIN_EURC_AMOUNT} and ${MAX_EURC_AMOUNT} EURC`,
      },
      { status: 400 }
    );
  }

  const fee = (sellAmt * 0.005).toFixed(7);
  const buyAmt = (sellAmt * MOCK_EURC_TRY_RATE - Number(fee) * MOCK_EURC_TRY_RATE).toFixed(7);
  const id = `mockq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const quote: MockQuote = {
    id,
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    price: MOCK_EURC_TRY_RATE.toFixed(7),
    sell_asset: sellAsset,
    buy_asset: buyAsset,
    sell_amount: sellAmt.toFixed(7),
    buy_amount: buyAmt,
    fee: { total: fee, asset: sellAsset, details: [{ name: "Mock anchor fee", amount: fee }] },
  };
  quotes.set(id, quote);
  return NextResponse.json(quote);
}
