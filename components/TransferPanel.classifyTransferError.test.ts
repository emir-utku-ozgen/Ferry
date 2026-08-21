import { describe, expect, it } from "vitest";
import { classifyTransferError } from "./TransferPanel";
import { ApiError } from "@/lib/stellar/client/http";

describe("classifyTransferError — the failure-matrix classification the 4 SOW failure screens key off", () => {
  it("classifies an anchor-side expired-quote rejection as quote_expired, not a generic anchor_rejected", () => {
    const err = new ApiError("quote_expired: Quote mockq_1 expired at ...", 400, "ANCHOR_REJECTED");
    expect(classifyTransferError(err)).toEqual({ type: "quote_expired", message: err.message });
  });

  it("classifies an asset-configuration rejection (e.g. testanchor's known SEP-31 gap) as anchor_rejected with an explanatory prefix", () => {
    const err = new ApiError('Asset [USDC] has no fields definition', 400, "ANCHOR_REJECTED");
    const result = classifyTransferError(err);
    expect(result.type).toBe("anchor_rejected");
    expect(result.message).toContain("Anchor cannot settle this asset automatically");
  });

  it("classifies a bank/IBAN-shaped rejection as invalid_recipient_details", () => {
    const err = new ApiError("invalid IBAN in bank_account_number field", 400, "ANCHOR_REJECTED");
    expect(classifyTransferError(err)).toEqual({ type: "invalid_recipient_details", message: err.message });
  });

  it("falls back to a generic anchor_rejected for an unrecognized ANCHOR_REJECTED message", () => {
    const err = new ApiError("Some other reason", 400, "ANCHOR_REJECTED");
    expect(classifyTransferError(err)).toEqual({ type: "anchor_rejected", message: "Some other reason" });
  });

  it("falls back to anchor_rejected for a non-ApiError, non-anchor-coded failure rather than throwing", () => {
    expect(classifyTransferError(new Error("network exploded"))).toEqual({
      type: "anchor_rejected",
      message: "network exploded",
    });
  });

  it("handles a thrown non-Error value without crashing", () => {
    expect(classifyTransferError("a string, not an Error")).toEqual({ type: "anchor_rejected", message: "Transfer failed" });
  });
});
