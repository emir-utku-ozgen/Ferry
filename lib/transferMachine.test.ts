import { describe, expect, it } from "vitest";
import { initialTransferState, transferReducer, type TransferState } from "./transferMachine";
import type { FirmQuote } from "./stellar/client/sep38Client";
import type { FlowError } from "@/components/StatusTracker";

const quote: FirmQuote = {
  id: "mockq_test",
  expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
  price: "44.5",
  sell_asset: "stellar:EURC:GISSUER",
  buy_asset: "stellar:TRY:GISSUER2",
  sell_amount: "10",
  buy_amount: "442.775",
};

const anchorError: FlowError = { type: "anchor_rejected", message: "nope" };

function settled(state: TransferState): TransferState {
  return transferReducer(state, { type: "TRANSFER_STATUS_CHANGED", status: "completed" });
}

describe("transferReducer", () => {
  it("starts from the documented initial state", () => {
    expect(initialTransferState).toEqual({
      sep10Token: null,
      lockedQuote: null,
      kycStatus: "not_started",
      transferStatus: null,
      flowError: null,
    });
  });

  it("AUTHENTICATED sets the token", () => {
    const next = transferReducer(initialTransferState, { type: "AUTHENTICATED", token: "jwt123" });
    expect(next.sep10Token).toBe("jwt123");
  });

  it("AUTHENTICATED is idempotent — replaying the same token returns the same state reference", () => {
    const first = transferReducer(initialTransferState, { type: "AUTHENTICATED", token: "jwt123" });
    const replay = transferReducer(first, { type: "AUTHENTICATED", token: "jwt123" });
    expect(replay).toBe(first);
  });

  it("QUOTE_LOCKED sets the quote and clears any prior flow error", () => {
    const withError = transferReducer(initialTransferState, { type: "FLOW_ERROR_RAISED", error: anchorError });
    const next = transferReducer(withError, { type: "QUOTE_LOCKED", quote });
    expect(next.lockedQuote).toEqual(quote);
    expect(next.flowError).toBeNull();
  });

  it("QUOTE_LOCKED clears a stale transferStatus from a prior, already-settled transfer — starting a second transfer must not show 'Completed' before it's even begun", () => {
    const firstTransferDone = settled(
      transferReducer(initialTransferState, { type: "KYC_STATUS_CHANGED", status: "ACCEPTED" })
    );
    expect(firstTransferDone.transferStatus).toBe("completed");

    const secondQuote: FirmQuote = { ...quote, id: "mockq_second" };
    const next = transferReducer(firstTransferDone, { type: "QUOTE_LOCKED", quote: secondQuote });
    expect(next.transferStatus).toBeNull();
    expect(next.lockedQuote).toEqual(secondQuote);
    // KYC status is deliberately preserved — it doesn't need repeating per transfer.
    expect(next.kycStatus).toBe("ACCEPTED");
  });

  it("AUTHENTICATED with a genuinely different token (e.g. reconnect) overwrites the prior one", () => {
    const first = transferReducer(initialTransferState, { type: "AUTHENTICATED", token: "jwt-old" });
    const next = transferReducer(first, { type: "AUTHENTICATED", token: "jwt-new" });
    expect(next.sep10Token).toBe("jwt-new");
  });

  it("KYC_STATUS_CHANGED updates status and is idempotent on repeat", () => {
    const first = transferReducer(initialTransferState, { type: "KYC_STATUS_CHANGED", status: "ACCEPTED" });
    expect(first.kycStatus).toBe("ACCEPTED");
    const replay = transferReducer(first, { type: "KYC_STATUS_CHANGED", status: "ACCEPTED" });
    expect(replay).toBe(first);
  });

  it("TRANSFER_STATUS_CHANGED updates the status under normal progression", () => {
    const next = transferReducer(initialTransferState, { type: "TRANSFER_STATUS_CHANGED", status: "pending_receiver" });
    expect(next.transferStatus).toBe("pending_receiver");
  });

  it("TRANSFER_STATUS_CHANGED refuses to regress a transfer that already reached a terminal SETTLED status", () => {
    const done = settled(initialTransferState);
    // A stale/out-of-order poll tick reporting an earlier-looking status.
    const regressed = transferReducer(done, { type: "TRANSFER_STATUS_CHANGED", status: "pending_receiver" });
    expect(regressed.transferStatus).toBe("completed");
  });

  it("FLOW_ERROR_RAISED sets the error under normal conditions", () => {
    const next = transferReducer(initialTransferState, { type: "FLOW_ERROR_RAISED", error: anchorError });
    expect(next.flowError).toEqual(anchorError);
  });

  it("FLOW_ERROR_RAISED is ignored once the transfer already reached SETTLED — a late error can't retroactively fail a completed transfer", () => {
    const done = settled(initialTransferState);
    const next = transferReducer(done, { type: "FLOW_ERROR_RAISED", error: anchorError });
    expect(next.flowError).toBeNull();
    expect(next.transferStatus).toBe("completed");
  });

  it("FLOW_ERROR_DISMISSED clears the error", () => {
    const withError = transferReducer(initialTransferState, { type: "FLOW_ERROR_RAISED", error: anchorError });
    const cleared = transferReducer(withError, { type: "FLOW_ERROR_DISMISSED" });
    expect(cleared.flowError).toBeNull();
  });

  it("FLOW_ERROR_DISMISSED is idempotent when there's no error to clear", () => {
    const cleared = transferReducer(initialTransferState, { type: "FLOW_ERROR_DISMISSED" });
    expect(cleared).toBe(initialTransferState);
  });

  it("SESSION_RESET returns to the initial state regardless of prior progress", () => {
    let state = transferReducer(initialTransferState, { type: "AUTHENTICATED", token: "jwt123" });
    state = transferReducer(state, { type: "QUOTE_LOCKED", quote });
    state = transferReducer(state, { type: "KYC_STATUS_CHANGED", status: "ACCEPTED" });
    state = settled(state);
    const reset = transferReducer(state, { type: "SESSION_RESET" });
    expect(reset).toEqual(initialTransferState);
  });
});
