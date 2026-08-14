import { parseJsonOrThrow } from "./http";

/** Browser-side calls into Ferry's `/api/sep12/*` orchestrator route. */

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

export async function fetchCustomerInfo(
  domain: string,
  token: string,
  account: string,
  type?: string
): Promise<Sep12CustomerInfo> {
  const query = new URLSearchParams({ domain, token, account, ...(type ? { type } : {}) });
  const res = await fetch(`/api/sep12/customer?${query.toString()}`);
  return parseJsonOrThrow<Sep12CustomerInfo>(res);
}

export async function submitCustomerInfo(
  domain: string,
  token: string,
  fields: Record<string, string>,
  options: { idempotencyKey?: string; transferId?: string } = {}
): Promise<{ id: string }> {
  const res = await fetch("/api/sep12/customer", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify({ domain, token, fields, transferId: options.transferId }),
  });
  return parseJsonOrThrow<{ id: string }>(res);
}

export async function deleteCustomerInfo(domain: string, token: string, id: string): Promise<void> {
  const query = new URLSearchParams({ domain, token, id });
  const res = await fetch(`/api/sep12/customer?${query.toString()}`, { method: "DELETE" });
  await parseJsonOrThrow<{ ok: boolean }>(res);
}
