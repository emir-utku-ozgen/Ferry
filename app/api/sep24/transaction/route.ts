import { NextRequest, NextResponse } from "next/server";
import { getTransactionStatus } from "@/lib/stellar/sep24";

/**
 * GET /api/sep24/transaction?domain=...&token=...&id=...
 *
 * Polls the anchor for the current status of a SEP-24 transaction
 * (e.g. incomplete -> pending_user_transfer_start -> completed).
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
    const transaction = await getTransactionStatus(domain, token, id);
    return NextResponse.json(transaction);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown SEP-24 error" },
      { status: 502 }
    );
  }
}
