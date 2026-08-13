import { resolveAnchorToml } from "./toml";
import { anchorFetch, assertAnchorOk } from "./anchorFetch";
import { AnchorError } from "./anchorError";

/**
 * SEP-12: Customer Info (KYC) API.
 *
 * SEP-31 direct payments — and, for some anchors, SEP-24 — require the
 * sender to have registered customer information before a transaction can
 * be created. Ferry never stores this data itself: `getCustomerInfo()` and
 * `submitCustomerInfo()` are thin, typed proxies straight through to the
 * anchor's own KYC_SERVER, identical in spirit to how SEP-24 hands off to
 * the anchor's hosted UI. Binary fields (photo IDs, proof of residence,
 * etc.) are out of scope here — this covers the textual fields (name,
 * email, IBAN/bank details) needed to unblock a SEP-31 transaction.
 */

export type Sep12Status = "ACCEPTED" | "PROCESSING" | "NEEDS_INFO" | "REJECTED";

export interface Sep12Field {
  type: "string" | "binary" | "number" | "date";
  description: string;
  choices?: string[];
  optional?: boolean;
}

export interface Sep12CustomerInfo {
  id?: string;
  status: Sep12Status;
  fields?: Record<string, Sep12Field>;
  provided_fields?: Record<string, Sep12Field & { status?: string }>;
  message?: string;
}

export interface Sep12PutResponse {
  id: string;
}

async function kycServer(domain: string): Promise<string> {
  const toml = await resolveAnchorToml(domain);
  if (!toml.kycServer) {
    throw new AnchorError("ANCHOR_REJECTED", `Anchor "${domain}" does not advertise a KYC_SERVER (SEP-12 unsupported)`);
  }
  return toml.kycServer;
}

export async function getCustomerInfo(
  domain: string,
  token: string,
  params: { account: string; type?: string; lang?: string }
): Promise<Sep12CustomerInfo> {
  const base = await kycServer(domain);
  const url = new URL(`${base}/customer`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });

  const context = `SEP-12 customer lookup at "${domain}"`;
  const res = await anchorFetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } }, context);
  await assertAnchorOk(res, context);
  return res.json();
}

/** Deletes a previously-submitted SEP-12 customer record at the anchor. */
export async function deleteCustomerInfo(domain: string, token: string, id: string): Promise<void> {
  const base = await kycServer(domain);
  const context = `SEP-12 customer deletion at "${domain}"`;
  const res = await anchorFetch(
    `${base}/customer/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    context
  );
  await assertAnchorOk(res, context);
}

export async function submitCustomerInfo(
  domain: string,
  token: string,
  fields: Record<string, string>
): Promise<Sep12PutResponse> {
  const base = await kycServer(domain);
  const context = `SEP-12 customer submission to "${domain}"`;
  const res = await anchorFetch(
    `${base}/customer`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fields),
    },
    context
  );
  await assertAnchorOk(res, context);
  return res.json();
}
