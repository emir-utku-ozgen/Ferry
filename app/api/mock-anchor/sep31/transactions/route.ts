import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { verifyBearerToken } from "@/lib/mockAnchor/auth";
import { amountOutOfRange, ensureSigningAccountFunded, getSigningKeypair, MIN_EURC_AMOUNT, MAX_EURC_AMOUNT } from "@/lib/mockAnchor/config";
import { customerKey, customers, quotes, transactions, type MockTransaction } from "@/lib/mockAnchor/state";
import { isQuoteExpired } from "@/lib/mockAnchor/settlement";

/**
 * POST /api/mock-anchor/sep31/transactions — creates a direct payment
 * transaction. Direct port of mock-anchor/server.js's `/sep31/transactions`
 * handler: requires ACCEPTED sender KYC, validates the quote (if any)
 * hasn't expired, and returns the settlement account/memo the sender pays
 * to complete the transfer — the same real-Testnet-payment mechanism
 * TransferPanel.tsx's "Pay with Freighter" step already drives.
 */
export async function POST(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "mock-anchor-sep31-create");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const auth = verifyBearerToken(req);
  if (!auth) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

  let body: { amount?: string; asset_code?: string; quote_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { amount, asset_code: assetCode, quote_id: quoteId } = body;

  if (assetCode !== "EURC") {
    return NextResponse.json({ error: `Asset [${assetCode}] not supported by this mock anchor — only EURC` }, { status: 400 });
  }

  const customer = customers.get(customerKey(auth.account));
  if (!customer || customer.status !== "ACCEPTED") {
    return NextResponse.json({ error: "Sender KYC not accepted — complete SEP-12 first" }, { status: 400 });
  }

  const quote = quoteId ? quotes.get(quoteId) : null;
  if (quoteId && !quote) {
    return NextResponse.json({ error: "quote_id not found or already expired from this mock anchor's memory" }, { status: 400 });
  }
  if (quote && isQuoteExpired(quote)) {
    return NextResponse.json(
      { error: "quote_expired", message: `Quote ${quote.id} expired at ${quote.expires_at} — request a fresh quote before creating a transaction` },
      { status: 400 }
    );
  }

  // A quote already carries a validated sell_amount; a raw `amount` with no
  // quote_id hasn't been checked yet, so validate it here too.
  const effectiveAmount = Number(quote ? quote.sell_amount : amount);
  if (amountOutOfRange(effectiveAmount)) {
    return NextResponse.json(
      {
        error: effectiveAmount < MIN_EURC_AMOUNT ? "too_small" : "too_large",
        message: `amount must be between ${MIN_EURC_AMOUNT} and ${MAX_EURC_AMOUNT} EURC`,
      },
      { status: 400 }
    );
  }

  // Actually needs the receiving account to exist and trust EURC before
  // it's usable as a settlement destination — the one step in this route
  // that does real network I/O and can genuinely fail (Friendbot down,
  // Horizon slow). Checked here, at creation time, so a problem surfaces
  // as one clear, retryable error now rather than a confusing payment
  // failure later when the sender actually tries to pay this account.
  const readiness = await ensureSigningAccountFunded();
  if (!readiness.fundedAndTrusting) {
    return NextResponse.json(
      {
        error: "receiving_account_not_ready",
        message: `This mock anchor's settlement account isn't ready yet: ${readiness.reason}. Try again in a few seconds.`,
      },
      { status: 503 }
    );
  }

  const signingKeypair = getSigningKeypair();
  const id = Math.random().toString(36).slice(2, 10); // short — fits as a Stellar text memo
  const tx: MockTransaction = {
    id,
    status: "pending_receiver",
    quote_id: quoteId,
    amount: quote ? quote.sell_amount : (amount as string),
    sender: auth.account,
    created_at: new Date().toISOString(),
  };
  transactions.set(id, tx);

  return NextResponse.json({
    id,
    stellar_account_id: signingKeypair.publicKey(),
    stellar_memo_type: "text",
    stellar_memo: id,
  });
}
