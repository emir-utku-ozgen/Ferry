import { logger } from "./logger";

/**
 * Minimal, dependency-free failure-rate alerting (SOW Deliverable 2: "basic
 * monitoring/alerting" — nothing consumed lib/logger.ts's structured output
 * before this; GAP_ANALYSIS.md's own finding was "no alerting system
 * consumes it yet").
 *
 * Same architectural pattern as lib/rateLimit.ts: an in-memory,
 * process-local sliding window. This is enough to catch a genuine spike
 * within one running instance — it is explicitly not a substitute for a
 * real monitoring platform (Sentry/Datadog/a shared store) at Mainnet
 * scale, which needs credentials and infrastructure this environment
 * doesn't have. Tracked as a further step in docs/RUNBOOK.md §5.
 *
 * Coverage, stated plainly: every state-mutating route wrapped in
 * `withInstrumentation()` (lib/apiInstrumentation.ts) and every rate-limit
 * rejection (lib/rateLimit.ts) feed this automatically. A handful of
 * read-only GET routes that call an anchor directly without going through
 * `withInstrumentation` (e.g. this file's own neighbors that skip it for a
 * simple lookup) are not yet covered — closing that is a mechanical
 * follow-up (wrap them too), not a design gap.
 */

const WINDOW_MS = 5 * 60_000;
const FAILURE_THRESHOLD = 5; // alert once a route sees this many failures within WINDOW_MS

const buckets = new Map<string, number[]>();
// Prevents the same alert firing on every request once a route is already
// over threshold — re-arms once the rate drops back under it.
const alerted = new Set<string>();

function prune(timestamps: number[], now: number): number[] {
  return timestamps.filter((t) => now - t <= WINDOW_MS);
}

/**
 * Records one failure (a non-2xx anchor-facing response, or a rate-limit
 * rejection) for `route`, and emits a structured "alert.triggered" log
 * line the first time that route's failure count within the trailing
 * WINDOW_MS crosses FAILURE_THRESHOLD.
 */
export function recordFailure(route: string, code?: string): void {
  const now = Date.now();
  const timestamps = prune(buckets.get(route) ?? [], now);
  timestamps.push(now);
  buckets.set(route, timestamps);

  if (timestamps.length >= FAILURE_THRESHOLD) {
    if (!alerted.has(route)) {
      alerted.add(route);
      logger.error({
        route,
        event: "alert.triggered",
        code,
        message: `${timestamps.length} failures on "${route}" within the last ${WINDOW_MS / 1000}s`,
      });
    }
  } else {
    alerted.delete(route);
  }
}

/** Snapshot of which routes are currently over the alert threshold — surfaced by GET /api/health. */
export function currentAlerts(): string[] {
  return [...alerted];
}
