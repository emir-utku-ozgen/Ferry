import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { verifyBearerToken } from "@/lib/mockAnchor/auth";
import { customerKey, customers, type MockCustomerRecord } from "@/lib/mockAnchor/state";
import { maskIban, validateIban } from "@/lib/iban";

const SENDER_FIELDS = {
  first_name: { type: "string", description: "Sender's first name" },
  last_name: { type: "string", description: "Sender's last name" },
  email_address: { type: "string", description: "Sender's email address", optional: true },
};

const RECEIVER_FIELDS = {
  first_name: { type: "string", description: "Recipient's first name" },
  last_name: { type: "string", description: "Recipient's last name" },
  bank_name: { type: "string", description: "Recipient's bank name", optional: true },
  bank_account_number: { type: "string", description: "Recipient's IBAN" },
};

/**
 * GET/PUT /api/mock-anchor/sep12/customer — SEP-12 customer info. Direct
 * port of mock-anchor/server.js's `/sep12/customer` handlers: no real
 * identity verification happens here, an otherwise-valid submission is
 * accepted immediately. Server-side IBAN validation (reusing lib/iban.ts —
 * the same validator Ferry's own KYC UI runs client-side) makes an
 * anchor-side rejection of a malformed IBAN genuinely reproducible, not
 * only a client-side check.
 */
export async function GET(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "mock-anchor-sep12-get");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const auth = verifyBearerToken(req);
  if (!auth) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type") ?? undefined;
  const existing = customers.get(customerKey(auth.account, type));
  if (existing) return NextResponse.json(existing);

  const fields = type === "sep31-receiver" ? RECEIVER_FIELDS : SENDER_FIELDS;
  return NextResponse.json({ status: "NEEDS_INFO", fields });
}

export async function PUT(req: NextRequest) {
  const rateLimit = checkRateLimit(req, "mock-anchor-sep12-put");
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const auth = verifyBearerToken(req);
  if (!auth) return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });

  let body: Record<string, string> & { type?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { type } = body;

  let mockMaskedFields: MockCustomerRecord["mock_masked_fields"];
  if (type === "sep31-receiver") {
    const iban = body.bank_account_number;
    if (!iban) {
      return NextResponse.json({ error: "bank_account_number (IBAN) is required for a sep31-receiver record" }, { status: 400 });
    }
    const result = validateIban(iban);
    if (!result.valid) {
      return NextResponse.json({ error: "invalid_iban", message: result.reason }, { status: 400 });
    }
    // Only the masked IBAN is kept — the raw value isn't retained anywhere
    // past this validation step. Lets the claim page show a real
    // "you're verified" confirmation on a return visit.
    mockMaskedFields = {
      first_name: body.first_name,
      last_name: body.last_name,
      bank_account_number_masked: maskIban(result.normalized),
    };
  }

  customers.set(customerKey(auth.account, type), {
    status: "ACCEPTED",
    id: auth.account,
    ...(mockMaskedFields ? { mock_masked_fields: mockMaskedFields } : {}),
  });
  return NextResponse.json({ id: auth.account });
}
