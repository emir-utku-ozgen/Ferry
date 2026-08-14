import { parseJsonOrThrow } from "@/lib/stellar/client/http";

export interface AuditEvent {
  timestamp: string;
  event: string;
  status?: string;
  code?: string;
  detail?: string;
}

export async function fetchAuditTrail(transferId: string): Promise<AuditEvent[]> {
  const res = await fetch(`/api/audit/${encodeURIComponent(transferId)}`);
  const { events } = await parseJsonOrThrow<{ transferId: string; events: AuditEvent[] }>(res);
  return events;
}
