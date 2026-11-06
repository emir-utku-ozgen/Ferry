"use strict";

/**
 * Namespaces a SEP-12 customer record by role, not just by Stellar
 * account. Ferry's recipient claim link reuses the sender's own SEP-10
 * token/account rather than minting a receiver-scoped one (a known,
 * stated simplification — see KEY_MANAGEMENT.md §2), so without this, a
 * sender's own already-ACCEPTED KYC record would silently answer for a
 * receiver's claim under the same account too, skipping the IBAN form
 * entirely — the exact bug this closes.
 */
function customerKey(account, type, transactionId) {
  const base = `${account}:${type || "sep31-sender"}`;
  // A SEP-12 `transaction_id` scopes the record to a single transfer (one
  // recipient per claim link) instead of one record per sender account.
  return transactionId ? `${base}:${transactionId}` : base;
}

module.exports = { customerKey };
