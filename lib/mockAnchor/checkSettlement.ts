import type { Horizon } from "@stellar/stellar-sdk";
import { getHorizonServer, EURC_ISSUER } from "@/lib/stellar/config";
import { getSigningKeypair } from "./config";
import { isSettlementSufficient, sumPaymentAmounts } from "./settlement";
import type { MockTransaction } from "./state";

/**
 * On-demand equivalent of mock-anchor/server.js's background `setInterval`
 * payment poller. Vercel's serverless model has nowhere to run a
 * standalone background process between requests, so instead of polling
 * independently, this runs live — triggered by the same client poll that
 * already exists: `TransferPanel.tsx`'s `Sep31Panel` calls
 * `GET /api/sep31/transactions?...` (which reaches this mock anchor's
 * `GET /sep31/transactions/:id`) on a 4-second interval while a transfer is
 * pending. Each of those polls now doubles as the settlement check —
 * functionally equivalent, since the trigger cadence is the same 4s either
 * way, just client-driven instead of a server-side timer.
 *
 * Mutates `tx` in place (same as the original's `tx.status = "completed"`)
 * — the caller re-reads the (now possibly updated) record after this
 * resolves. Fails open: a Horizon error here leaves `tx` exactly as it was,
 * so a transient failure just means "not settled yet" on this poll,
 * matching the original's `catch { console.warn(...) }` — the next poll
 * tries again.
 */
export async function checkAndSettleTransaction(tx: MockTransaction): Promise<void> {
  if (tx.status !== "pending_receiver") return;

  try {
    const signingKeypair = await getSigningKeypair();
    const server = getHorizonServer();
    const payments = await server.payments().forAccount(signingKeypair.publicKey()).order("desc").limit(20).call();

    const candidates = payments.records.filter(
      (p): p is Horizon.ServerApi.PaymentOperationRecord =>
        p.type === "payment" &&
        (p as Horizon.ServerApi.PaymentOperationRecord).to === signingKeypair.publicKey() &&
        (p as Horizon.ServerApi.PaymentOperationRecord).asset_code === "EURC" &&
        (p as Horizon.ServerApi.PaymentOperationRecord).asset_issuer === EURC_ISSUER
    );
    if (candidates.length === 0) return;

    // Text memo isn't on the payment operation record itself — fetch each
    // candidate's parent transaction to find every payment that actually
    // targets this tx id (there can be more than one, e.g. a sender
    // topping up an initial short payment with the same memo).
    const matches: Horizon.ServerApi.PaymentOperationRecord[] = [];
    for (const candidate of candidates) {
      const parentTx = await candidate.transaction();
      if (parentTx.memo === tx.id) matches.push(candidate);
    }
    if (matches.length === 0) return;

    const receivedAmount = sumPaymentAmounts(matches);
    tx.received_amount = receivedAmount.toFixed(7);

    // Require the cumulative amount received under this memo to cover the
    // invoiced amount before reporting the transfer as settled — a payment
    // that matches on memo but falls short must not be marked "completed".
    const required = Number(tx.amount);
    if (!isSettlementSufficient(receivedAmount, required)) return;

    tx.status = "completed";
    tx.stellar_transaction_id = matches[matches.length - 1].transaction_hash;
  } catch {
    // Transient Horizon failure — leave tx as-is, next poll retries.
  }
}
