import { Networks } from "@stellar/stellar-sdk";

/**
 * Links to Stellar Expert, the public block explorer, so anyone can verify
 * a Ferry transaction independently. The explorer network follows the
 * configured network passphrase: Testnet unless the passphrase is the
 * public-network one.
 */
export function explorerNetwork(passphrase: string): "public" | "testnet" {
  return passphrase === Networks.PUBLIC ? "public" : "testnet";
}

export function explorerTxUrl(hash: string, passphrase: string): string {
  return `https://stellar.expert/explorer/${explorerNetwork(passphrase)}/tx/${encodeURIComponent(hash)}`;
}
