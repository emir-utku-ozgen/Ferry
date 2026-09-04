import jwt from "jsonwebtoken";
import type { NextRequest } from "next/server";
import { getJwtSecret } from "./config";

/** Issues a SEP-10 session JWT for `account`, mirroring mock-anchor/server.js's own 1h expiry. */
export function issueBearerToken(account: string, homeDomain: string): string {
  return jwt.sign({ sub: account, iss: homeDomain }, getJwtSecret(), { expiresIn: "1h" });
}

/**
 * Verifies the request's `Authorization: Bearer <jwt>` header and returns
 * the authenticated Stellar account, or `null` if missing/invalid/expired
 * — callers should respond 401 in that case, same idiom as
 * `checkRateLimit`/`rateLimitResponse` elsewhere in this codebase.
 */
export function verifyBearerToken(req: NextRequest): { account: string } | null {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (typeof payload === "string" || !payload.sub) return null;
    return { account: payload.sub };
  } catch {
    return null;
  }
}
