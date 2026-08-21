"use strict";

/**
 * IBAN structural + checksum validation (ISO 13616 / mod-97-10) — a
 * CommonJS port of lib/iban.ts's algorithm, kept in sync manually since
 * mock-anchor/ is a separate package and can't import the Next.js app's
 * TS module directly. Used so a receiver's submitted IBAN is verified
 * server-side too, not only by Ferry's own client-side check — the SOW
 * asks for Turkish IBAN (TR...) format enforcement specifically, covered
 * here by the same general table Ferry's own validator uses.
 */

const IBAN_LENGTH_BY_COUNTRY = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18,
  EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GR: 27, HR: 21, HU: 28, IE: 22,
  IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18,
  NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, TR: 26,
};

function mod97(numeric) {
  let remainder = numeric;
  while (remainder.length > 2) {
    const chunk = remainder.slice(0, 9);
    remainder = String(Number(chunk) % 97) + remainder.slice(chunk.length);
  }
  return Number(remainder) % 97;
}

function validateIban(raw) {
  const normalized = String(raw || "").replace(/\s+/g, "").toUpperCase();

  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(normalized)) {
    return { valid: false, reason: "Must start with a 2-letter country code and 2 check digits.", normalized };
  }

  const country = normalized.slice(0, 2);
  const expectedLength = IBAN_LENGTH_BY_COUNTRY[country];
  if (!expectedLength) {
    return { valid: false, reason: `Unrecognized IBAN country code "${country}".`, normalized };
  }
  if (normalized.length !== expectedLength) {
    return {
      valid: false,
      reason: `${country} IBANs are ${expectedLength} characters — this one is ${normalized.length}.`,
      normalized,
    };
  }

  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  const numeric = rearranged
    .split("")
    .map((ch) => (/[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch))
    .join("");

  if (mod97(numeric) !== 1) {
    return { valid: false, reason: "Failed the IBAN checksum — check for a typo in the digits.", normalized };
  }

  return { valid: true, normalized };
}

/**
 * Formats a validated, normalized IBAN as e.g. "TR33 **** **** **** ****
 * **** 4001" — first/last 4 characters visible, the rest masked. Mirrors
 * app/claim/[id]/page.tsx's own client-side maskIban() exactly, so the
 * two produce identical output. A real anchor would never echo a
 * submitted IBAN back over the wire unmasked; this mock shouldn't either
 * — GET /sep12/customer only ever returns this masked form, never the
 * raw value (see server.js's PUT handler).
 */
function maskIban(normalized) {
  if (normalized.length <= 8) return normalized;
  const visibleStart = normalized.slice(0, 4);
  const visibleEnd = normalized.slice(-4);
  const masked = visibleStart + "*".repeat(normalized.length - 8) + visibleEnd;
  return masked.match(/.{1,4}/g)?.join(" ") ?? masked;
}

module.exports = { validateIban, maskIban };
