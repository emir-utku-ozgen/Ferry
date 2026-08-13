import { NextRequest, NextResponse } from "next/server";
import { createSep31Transaction, getSep31Transaction } from "@/lib/stellar/sep31";

/**
 * POST /api/sep31/transactions
 * Body: { domain, token, ...Sep31TransactionRequest }
 *
 * Creates a direct cross-border payment transaction with the receiving
 * anchor. Typically called after a SEP-38 firm quote has been obtained.
 */
export async function POST(req: NextRequest) {
  try {
    const { domain, token, ...payload } = await req.json();
    if (!domain || !token) {
      return NextResponse.json({ error: "`domain` and `token` are required" }, { status: 400 });
    }

    const transaction = await createSep31Transaction(domain, token, payload);
    return NextResponse.json(transaction);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown SEP-31 error" },
      { status: 502 }
    );
  }
}

/**
 * GET /api/sep31/transactions?domain=...&token=...&id=...
 * Looks up the status of a previously created SEP-31 transaction.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  const token = searchParams.get("token");
  const id = searchParams.get("id");

  if (!domain || !token || !id) {
    return NextResponse.json({ error: "`domain`, `token` and `id` query params are required" }, { status: 400 });
  }

  try {
    const transaction = await getSep31Transaction(domain, token, id);
    return NextResponse.json(transaction);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown SEP-31 error" },
      { status: 502 }
    );
  }
}
