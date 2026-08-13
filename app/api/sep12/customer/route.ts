import { NextRequest, NextResponse } from "next/server";
import { deleteCustomerInfo, getCustomerInfo, submitCustomerInfo } from "@/lib/stellar/sep12";
import { toApiErrorResponse } from "@/lib/stellar/anchorError";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

/**
 * GET /api/sep12/customer?domain=...&token=...&account=...
 *
 * Looks up the sender's SEP-12 customer record and required-field list at
 * the anchor. Drives the KYC modal's dynamic form and status display.
 */
export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep12-customer-get");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  const token = searchParams.get("token");
  const account = searchParams.get("account");

  if (!domain || !token || !account) {
    return NextResponse.json({ error: "`domain`, `token` and `account` query params are required" }, { status: 400 });
  }

  try {
    const info = await getCustomerInfo(domain, token, { account });
    return NextResponse.json(info);
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-12 error");
    return NextResponse.json(body, { status });
  }
}

/**
 * PUT /api/sep12/customer
 * Body: { domain, token, fields: Record<string, string> }
 *
 * Submits the sender's KYC fields (name, email, IBAN/bank details, etc.)
 * to the anchor. Ferry relays this call — it never stores KYC data.
 */
export async function PUT(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "sep12-customer-put");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    const { domain, token, fields } = await req.json();
    if (!domain || !token || !fields) {
      return NextResponse.json({ error: "`domain`, `token` and `fields` are required" }, { status: 400 });
    }

    const result = await submitCustomerInfo(domain, token, fields);
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toApiErrorResponse(err, "Unknown SEP-12 error");
    return NextResponse.json(body, { status });
  }
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
