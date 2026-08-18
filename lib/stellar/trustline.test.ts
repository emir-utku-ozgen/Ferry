import { describe, expect, it } from "vitest";
import { describeLowReserveError, describeUnderfundedError } from "./trustline";

function horizonError(resultCodes: { transaction?: string; operations?: string[] }) {
  return { response: { data: { extras: { result_codes: resultCodes } } } };
}

describe("describeLowReserveError", () => {
  it("recognizes tx_insufficient_balance", () => {
    const err = horizonError({ transaction: "tx_insufficient_balance" });
    expect(describeLowReserveError(err)).toMatch(/XLM/i);
  });

  it("recognizes op_low_reserve", () => {
    const err = horizonError({ transaction: "tx_failed", operations: ["op_low_reserve"] });
    expect(describeLowReserveError(err)).toMatch(/reserve/i);
  });

  it("returns null for an unrelated failure", () => {
    const err = horizonError({ transaction: "tx_failed", operations: ["op_no_trust"] });
    expect(describeLowReserveError(err)).toBeNull();
  });

  it("returns null when the error has no Horizon result_codes shape at all", () => {
    expect(describeLowReserveError(new Error("network error"))).toBeNull();
  });
});

describe("describeUnderfundedError", () => {
  it("recognizes op_underfunded and names the specific asset", () => {
    const err = horizonError({ transaction: "tx_failed", operations: ["op_underfunded"] });
    const message = describeUnderfundedError(err, "EURC");
    expect(message).toMatch(/Insufficient EURC balance/);
  });

  it("returns null for an unrelated failure — must not be confused with the XLM-reserve case", () => {
    const err = horizonError({ transaction: "tx_failed", operations: ["op_low_reserve"] });
    expect(describeUnderfundedError(err, "EURC")).toBeNull();
  });

  it("returns null when the error has no Horizon result_codes shape at all", () => {
    expect(describeUnderfundedError(new Error("network error"), "EURC")).toBeNull();
  });
});
