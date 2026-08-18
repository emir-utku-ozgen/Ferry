import type { FirmQuote } from "./stellar/client/sep38Client";
import type { FlowError, KycStatus } from "@/components/StatusTracker";

/**
 * Ferry's transfer-lifecycle state machine — the SOW's Deliverable 2 line
 * item ("idempotent transfer state machine") that previously didn't exist:
 * `app/page.tsx` held sep10Token/lockedQuote/kycStatus/transferStatus/
 * flowError as five independent `useState` calls, updated imperatively by
 * whichever component happened to call which setter, with no enforced
 * transition rules. This module centralizes those five fields behind a
 * single reducer.
 *
 * Idempotency here specifically means: applying the same action twice, or
 * applying an action that no longer makes sense given the current state
 * (e.g. a stale status-poll tick arriving after the transfer already
 * reached a terminal state), is a safe no-op — never a crash, and never a
 * silent regression of a more-final state back to a less-final one.
 *
 * This intentionally does not add session persistence (sessionStorage/a
 * backend session) — that's a separate, larger change tracked as a P2
 * mainnet-hardening item, not part of the P0 state-machine gap this closes.
 */

export interface TransferState {
  sep10Token: string | null;
  lockedQuote: FirmQuote | null;
  kycStatus: KycStatus;
  transferStatus: string | null;
  flowError: FlowError | null;
}

export const initialTransferState: TransferState = {
  sep10Token: null,
  lockedQuote: null,
  kycStatus: "not_started",
  transferStatus: null,
  flowError: null,
};

// Mirrors StatusTracker.tsx's own SETTLED_STATUSES — duplicated rather than
// imported to keep this module free of a UI-layer dependency; both must be
// kept in sync if the anchor status vocabulary changes (both cite this
// comment). A shared `lib/stellar/status.ts` would be the next refactor if
// a third consumer of this vocabulary appears.
const SETTLED_STATUSES = new Set(["completed"]);

export type TransferAction =
  | { type: "AUTHENTICATED"; token: string }
  | { type: "QUOTE_LOCKED"; quote: FirmQuote }
  | { type: "KYC_STATUS_CHANGED"; status: KycStatus }
  | { type: "TRANSFER_STATUS_CHANGED"; status: string | null }
  | { type: "FLOW_ERROR_RAISED"; error: FlowError }
  | { type: "FLOW_ERROR_DISMISSED" }
  | { type: "SESSION_RESET" };

export function transferReducer(state: TransferState, action: TransferAction): TransferState {
  switch (action.type) {
    case "AUTHENTICATED":
      if (state.sep10Token === action.token) return state; // idempotent replay
      return { ...state, sep10Token: action.token };

    case "QUOTE_LOCKED":
      // A freshly locked quote supersedes any error from a previous
      // attempt (e.g. a prior expired-quote rejection) — clearing it here
      // means the sender doesn't have to separately dismiss a stale error
      // banner after fixing the thing it was about.
      //
      // Also clears `transferStatus`: locking a quote signals the start of
      // a *new* transfer. Without this, sending a second transfer in the
      // same session after the first one reached "completed" would leave
      // the tracker showing "Completed / Delivered" immediately — before
      // the new transaction is even created — because SETTLED_STATUSES
      // still matched the *previous* transfer's leftover status. KYC
      // status is deliberately left alone: it's the sender's own identity
      // verification with the anchor, which doesn't need repeating per
      // transfer.
      return { ...state, lockedQuote: action.quote, flowError: null, transferStatus: null };

    case "KYC_STATUS_CHANGED":
      if (state.kycStatus === action.status) return state;
      return { ...state, kycStatus: action.status };

    case "TRANSFER_STATUS_CHANGED":
      // A transfer that already reached a terminal SETTLED status can't
      // move backward — guards against an out-of-order poll response (two
      // overlapping poll intervals racing) regressing the UI.
      if (state.transferStatus && SETTLED_STATUSES.has(state.transferStatus)) {
        return state;
      }
      return { ...state, transferStatus: action.status };

    case "FLOW_ERROR_RAISED":
      // Symmetric guard: a transfer that already settled can't
      // retroactively fail. Without this, a late/stale error (e.g. from an
      // abandoned retry) could clobber a correct "Completed / Delivered"
      // display.
      if (state.transferStatus && SETTLED_STATUSES.has(state.transferStatus)) {
        return state;
      }
      return { ...state, flowError: action.error };

    case "FLOW_ERROR_DISMISSED":
      if (state.flowError === null) return state;
      return { ...state, flowError: null };

    case "SESSION_RESET":
      return initialTransferState;

    default:
      return state;
  }
}
