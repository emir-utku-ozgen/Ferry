import { Asset, BASE_FEE, Memo, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { getHorizonServer, NETWORK_PASSPHRASE } from "./config";

/**
 * Builds the one on-chain payment a SEP-31 sender actually has to make —
 * the settlement leg to the receiving anchor's `stellar_account_id`, with
 * its `stellar_memo` so the anchor can match it to the transaction it just
 * created. Same pattern as `lib/stellar/trustline.ts`'s `buildChangeTrustXdr`:
 * an unsigned XDR for Freighter to sign client-side, Ferry never touches a
 * key. Closes the gap where the sender previously had to copy this
 * destination/amount/memo into an external wallet UI by hand.
 */
export async function buildSep31PaymentXdr(
  publicKey: string,
  destination: string,
  assetCode: string,
  assetIssuer: string | null,
  amount: string,
  memo?: string,
  memoType?: string
): Promise<string> {
  const server = getHorizonServer();
  const account = await server.loadAccount(publicKey);
  const asset = assetCode === "native" || !assetIssuer ? Asset.native() : new Asset(assetCode, assetIssuer);

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  }).addOperation(Operation.payment({ destination, asset, amount }));

  if (memo) {
    // SEP-31's stellar_memo_type is "text" | "hash" | "id" — every anchor
    // Ferry has tested against uses "text", but honor whatever the anchor
    // actually returned rather than assuming.
    if (memoType === "id") builder.addMemo(Memo.id(memo));
    else if (memoType === "hash") builder.addMemo(Memo.hash(memo));
    else builder.addMemo(Memo.text(memo));
  }

  return builder.setTimeout(180).build().toXDR();
}
