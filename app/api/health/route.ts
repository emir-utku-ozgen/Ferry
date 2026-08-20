import { NextResponse } from "next/server";
import { currentAlerts } from "@/lib/monitoring";

/**
 * GET /api/health — SOW Deliverable 2's "basic monitoring/alerting" line
 * item. Reports process liveness plus any route currently over the
 * failure-rate threshold tracked in lib/monitoring.ts, so an external
 * uptime check (or a human) has one endpoint to poll instead of grepping
 * logs. Intentionally has no anchor-facing dependency — it must stay
 * answerable even when every configured anchor is down.
 */
export async function GET() {
  const alerts = currentAlerts();
  return NextResponse.json(
    {
      ok: alerts.length === 0,
      timestamp: new Date().toISOString(),
      alerts,
    },
    { status: alerts.length === 0 ? 200 : 503 }
  );
}
