/**
 * IBAN structural + checksum validation (ISO 13616 / mod-97-10).
 *
 * Closes the "no IBAN validation exists anywhere" finding in
 * GAP_ANALYSIS.md §3 (SEP-12/24 KYC Handoff). This is real format
 * validation — country-specific length table plus the mod-97 checksum
 * every valid IBAN satisfies — not a cosmetic regex.
 */

// ISO 13616 fixed IBAN length per country. Not exhaustive of every IBAN
// country, but covers the EUR/TRY corridor and its immediate neighbors.
const IBAN_LENGTH_BY_COUNTRY: Record<string, number> = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18,
  EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GR: 27, HR: 21, HU: 28, IE: 22,
  IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18,
  NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24, SM: 27, TR: 26,
};

export interface IbanValidationResult {
  valid: boolean;
  reason?: string;
  /** Normalized (uppercase, no spaces) form, present even when invalid, for redisplay. */
  normalized: string;
}

function mod97(numeric: string): number {
  // The numeric string from IBAN rearrangement can be far larger than a
  // JS safe integer, so mod-97 is computed incrementally in chunks.
  let remainder = numeric;
  while (remainder.length > 2) {
    const chunk = remainder.slice(0, 9);
    remainder = String(Number(chunk) % 97) + remainder.slice(chunk.length);
  }
  return Number(remainder) % 97;
}

export function validateIban(raw: string): IbanValidationResult {
  const normalized = raw.replace(/\s+/g, "").toUpperCase();

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

  // Move the first 4 characters to the end, then convert every letter to
  // its 10-35 numeric value (A=10 ... Z=35), per ISO 13616 / mod-97-10.
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
