import { Asset, BASE_FEE, NotFoundError, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { getHorizonServer, NETWORK_PASSPHRASE } from "./config";

/**
 * Pre-flight trustline verification (Gap 4.3 in GAP_ANALYSIS.md).
 *
 * SEP-24 deposits of a non-native asset silently fail at the anchor once
 * the user has already completed KYC/funding in the hosted UI if the
 * destination account never established a trustline to that asset. This
 * module lets Ferry check for — and, if missing, help the user establish —
 * the trustline *before* handing off to the anchor, via a plain read-only
 * Horizon query and (if needed) a `ChangeTrust` operation signed locally by
 * Freighter. Neither operation moves funds or touches a secret key.
 */

export async function hasTrustline(publicKey: string, assetCode: string, assetIssuer: string): Promise<boolean> {
  try {
    const account = await getHorizonServer().loadAccount(publicKey);
    return account.balances.some(
      (balance) => "asset_code" in balance && balance.asset_code === assetCode && balance.asset_issuer === assetIssuer
    );
  } catch (err) {
    if (err instanceof NotFoundError) {
      // Account doesn't exist on the network yet — it has no trustlines.
      return false;
    }
    throw err;
  }
}

/** Builds an unsigned ChangeTrust transaction XDR for the given account to sign with Freighter. */
export async function buildChangeTrustXdr(publicKey: string, assetCode: string, assetIssuer: string): Promise<string> {
  const server = getHorizonServer();
  const account = await server.loadAccount(publicKey);
  const asset = new Asset(assetCode, assetIssuer);

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(180)
    .build();

  return transaction.toXDR();
}

/** Submits a Freighter-signed transaction (e.g. the ChangeTrust above) to Horizon. */
export async function submitSignedTransaction(signedTransactionXdr: string) {
  const server = getHorizonServer();
  const transaction = TransactionBuilder.fromXDR(signedTransactionXdr, NETWORK_PASSPHRASE);
  return server.submitTransaction(transaction);
}
