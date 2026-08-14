import { NextRequest, NextResponse } from "next/server";
import { deleteCustomerInfo, getCustomerInfo, submitCustomerInfo } from "@/lib/stellar/sep12";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { withInstrumentation } from "@/lib/apiInstrumentation";

/**
 * GET /api/sep12/customer?domain=...&token=...&account=...&type=...
 *
 * Looks up a SEP-12 customer record and required-field list at the
 * anchor. Drives both the sender's KYC modal and the recipient page's KYC
 * form — `type` (e.g. `sep31-sender` / `sep31-receiver`) is what tells the
 * anchor which role's field set to return for the same underlying account.
 */
export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep12-customer-get");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  const token = searchParams.get("token");
  const account = searchParams.get("account");
  const type = searchParams.get("type") ?? undefined;

  if (!domain || !token || !account) {
    return NextResponse.json({ error: "`domain`, `token` and `account` query params are required" }, { status: 400 });
  }

  try {
    const info = await getCustomerInfo(domain, token, { account, type });
    return NextResponse.json(info);
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-12 error");
    return NextResponse.json(body, { status });
  }
}

/**
 * PUT /api/sep12/customer
 * Body: { domain, token, fields: Record<string, string>, transferId? }
 * Header: Idempotency-Key (optional) — see app/api/sep24/deposit/route.ts.
 *
 * Submits the sender's KYC fields (name, email, IBAN/bank details, etc.)
 * to the anchor. Ferry relays this call — it never stores KYC data, and
 * never logs field *values* either (see lib/logger.ts) — only that a
 * submission happened, its outcome, and how many fields were sent.
 */
export async function PUT(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep12-customer-put");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  let body: { domain?: string; token?: string; fields?: Record<string, string>; transferId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { domain, token, fields, transferId } = body;
  if (!domain || !token || !fields) {
    return NextResponse.json({ error: "`domain`, `token` and `fields` are required" }, { status: 400 });
  }

  return withInstrumentation(
    req,
    "sep12-customer-put",
    "sep12.customer.submitted",
    async () => {
      try {
        const result = await submitCustomerInfo(domain, token, fields);
        return { status: 200, body: result };
      } catch (err) {
        return toApiErrorResponse(err, "Unknown SEP-12 error");
      }
    },
    transferId
  );
}

/**
 * DELETE /api/sep12/customer?domain=...&token=...&id=...
 * Removes a previously-submitted customer record at the anchor (e.g. if
 * the sender wants their KYC data withdrawn, or to correct a rejected
 * submission by starting over).
 */
export async function DELETE(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep12-customer-delete");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  const token = searchParams.get("token");
  const id = searchParams.get("id");

  if (!domain || !token || !id) {
    return NextResponse.json({ error: "`domain`, `token` and `id` query params are required" }, { status: 400 });
  }

  try {
    await deleteCustomerInfo(domain, token, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-12 error");
    return NextResponse.json(body, { status });
  }
}
