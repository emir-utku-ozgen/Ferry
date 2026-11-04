import { describe, expect, it } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import { explorerTxUrl } from "@/lib/stellar/explorer";

const HASH = "99389e9daf565ee4beb1f78a76e2beb429b9c8abdbfd2e167acdf237184ee561";

describe("explorerTxUrl", () => {
  it("links Testnet transactions to Stellar Expert's testnet explorer", () => {
    expect(explorerTxUrl(HASH, Networks.TESTNET)).toBe(`https://stellar.expert/explorer/testnet/tx/${HASH}`);
  });

  it("links public-network transactions to the public explorer", () => {
    expect(explorerTxUrl(HASH, Networks.PUBLIC)).toBe(`https://stellar.expert/explorer/public/tx/${HASH}`);
  });
});
