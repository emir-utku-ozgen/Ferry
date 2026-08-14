/**
 * Structured JSON logging (GAP_ANALYSIS.md §3: "no logging statement of
 * any kind exists anywhere"). Every entry is a single JSON object per
 * line to stdout — Vercel and most hosts capture stdout as structured
 * logs automatically, no external logging service dependency required.
 *
 * Deliberately never logs KYC field *values* (name, IBAN, bank details) —
 * only route/status/timing/error metadata. Ferry's non-custodial claim
 * ("identity documents never touch our servers") has to hold for logs
 * too, not just for the database Ferry doesn't have.
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogFields {
  route: string;
  event: string;
  transferId?: string;
  code?: string;
  status?: number;
  durationMs?: number;
  [key: string]: unknown;
}

function emit(level: LogLevel, fields: LogFields): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (fields: LogFields) => emit("info", fields),
  warn: (fields: LogFields) => emit("warn", fields),
  error: (fields: LogFields) => emit("error", fields),
};
