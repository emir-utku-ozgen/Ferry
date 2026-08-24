import { NextRequest, NextResponse } from "next/server";
import { resolveAnchorToml } from "@/lib/stellar/toml";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

/**
 * GET /api/anchor/currencies?domain=...
 *
 * Exposes an anchor's SEP-1 `[[CURRENCIES]]` list (code + issuer for each
 * asset it publishes). Lets the UI *discover* an asset's actual Stellar
 * identifier from whichever anchor is currently configured
 * (`NEXT_PUBLIC_ANCHOR_DOMAIN`) instead of hardcoding a guessed issuer and
 * hoping it matches — the concrete failure mode this closes: Ferry's own
 * `mock-anchor/` generates a fresh TRY issuer keypair on every boot unless
 * its `.env` pins one, so a hardcoded `NEXT_PUBLIC_MOCK_TRY_ISSUER`
 * default silently goes stale the moment someone restarts it differently.
 */
export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "anchor-currencies");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ error: "`domain` query param is required" }, { status: 400 });
  }

  try {
    const toml = await resolveAnchorToml(domain);
    return NextResponse.json({ currencies: toml.currencies });
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-1 error");
    return NextResponse.json(body, { status });
  }
}
