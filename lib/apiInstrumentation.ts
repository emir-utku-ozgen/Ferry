import { NextRequest, NextResponse } from "next/server";
import { getIdempotentResponse, storeIdempotentResponse } from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import { recordAuditEvent } from "@/lib/auditTrail";

export interface RouteResult {
  status: number;
  body: unknown;
}

/**
 * Wraps a state-mutating orchestrator route handler with:
 *  - idempotency replay, keyed by the client-supplied `Idempotency-Key`
 *    header (GAP_ANALYSIS.md §3: "no idempotency mechanism exists")
 *  - structured JSON logging of the outcome (§3: "no logging statement...
 *    exists anywhere")
 *  - an audit trail entry when the caller passes a `transferId` (§3: "no
 *    audit trail can be reconstructed")
 *
 * `handler` never sees the idempotency mechanics — it just does the work
 * and returns a status/body, same shape every route already produced.
 */
export async function withInstrumentation(
  req: NextRequest,
  routeName: string,
  event: string,
  handler: () => Promise<RouteResult>,
  transferId?: string
): Promise<NextResponse> {
  const idempotencyKey = req.headers.get("idempotency-key");
  const cacheKey = idempotencyKey ? `${routeName}:${idempotencyKey}` : null;

  if (cacheKey) {
    const cached = getIdempotentResponse(cacheKey);
    if (cached) {
      logger.info({ route: routeName, event: `${event}.replayed`, transferId, status: cached.status });
      return NextResponse.json(cached.body, { status: cached.status, headers: { "X-Idempotent-Replay": "true" } });
    }
  }

  const startedAt = Date.now();
  const result = await handler();
  const durationMs = Date.now() - startedAt;

  const bodyCode = (result.body as { code?: string } | null)?.code;
  logger.info({ route: routeName, event, transferId, status: result.status, code: bodyCode, durationMs });
  if (transferId) {
    recordAuditEvent(transferId, event, { status: String(result.status), code: bodyCode });
  }

  if (cacheKey) storeIdempotentResponse(cacheKey, result.status, result.body);

  return NextResponse.json(result.body, { status: result.status });
}
