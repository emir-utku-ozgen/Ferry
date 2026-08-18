import { describe, expect, it } from "vitest";
import { validateIban } from "./iban";

describe("validateIban", () => {
  it("accepts a real, checksum-valid German IBAN", () => {
    const result = validateIban("DE89 3704 0044 0532 0130 00");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("DE89370400440532013000");
  });

  it("accepts a real, checksum-valid Turkish IBAN (the corridor's receiving side)", () => {
    const result = validateIban("TR33 0006 1005 1978 6457 8413 26");
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe("TR330006100519786457841326");
  });

  it("accepts a real, checksum-valid UK IBAN", () => {
    const result = validateIban("GB29 NWBK 6016 1331 9268 19");
    expect(result.valid).toBe(true);
  });

  it("rejects a value that doesn't start with 2 letters + 2 digits", () => {
    const result = validateIban("1234567890");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/2-letter country code/i);
  });

  it("rejects an unrecognized country code", () => {
    const result = validateIban("ZZ89370400440532013000");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/unrecognized iban country/i);
  });

  it("rejects a wrong length for a recognized country", () => {
    const result = validateIban("DE8937040044053201300"); // one digit short
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/22 characters/);
  });

  it("rejects a correct-length, correct-country value that fails the mod-97 checksum (a realistic typo)", () => {
    // Same as the valid DE IBAN above with two digits transposed.
    const result = validateIban("DE89370400440532013001");
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/checksum/i);
  });

  it("is case- and whitespace-insensitive", () => {
    const result = validateIban("de89370400440532013000");
    expect(result.valid).toBe(true);
  });
});
