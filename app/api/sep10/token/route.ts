import { NextRequest, NextResponse } from "next/server";
import { submitSignedChallenge } from "@/lib/stellar/sep10";

/**
 * POST /api/sep10/token
 * Body: { domain: string, transaction: string }  // `transaction` is the
 * challenge XDR already signed client-side by Freighter.
 *
 * Exchanges the signed challenge for a SEP-10 JWT. The client keeps this
 * token in memory only — Ferry's server never persists it.
 */
export async function POST(req: NextRequest) {
  try {
    const { domain, transaction } = await req.json();
    if (!domain || !transaction) {
      return NextResponse.json({ error: "`domain` and `transaction` are required" }, { status: 400 });
    }

    const { token } = await submitSignedChallenge(domain, transaction);
    return NextResponse.json({ token });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown SEP-10 error" },
      { status: 502 }
    );
  }
}
