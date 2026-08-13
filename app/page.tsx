"use client";

import { useState } from "react";
import WalletConnect from "@/components/WalletConnect";
import RemittanceFlow from "@/components/RemittanceFlow";
import QuoteCalculator from "@/components/QuoteCalculator";
import TransferPanel from "@/components/TransferPanel";
import { ANCHOR_DOMAIN } from "@/lib/stellar/config";
import type { FirmQuote } from "@/lib/stellar/client/sep38Client";

export default function Home() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [sep10Token, setSep10Token] = useState<string | null>(null);
  const [lockedQuote, setLockedQuote] = useState<FirmQuote | null>(null);

  function handleDisconnect() {
    setPublicKey(null);
    setSep10Token(null);
    setLockedQuote(null);
  }

  return (
    <div className="flex flex-1 flex-col bg-black">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-6">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">Ferry</span>
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            Testnet
          </span>
        </div>
        <WalletConnect onConnect={setPublicKey} onDisconnect={handleDisconnect} />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-8 py-16">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Cross-border remittances, orchestrated&nbsp;— never custodied.
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-zinc-400">
            Ferry connects your Freighter wallet to Stellar-anchored remittance rails via SEP-10, SEP-24,
            SEP-31 and SEP-38. Funds and identity documents always stay with the licensed anchor.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <RemittanceFlow
            publicKey={publicKey}
            anchorDomain={ANCHOR_DOMAIN}
            token={sep10Token}
            onAuthenticated={setSep10Token}
            hasQuote={Boolean(lockedQuote)}
          />
          <QuoteCalculator
            anchorDomain={ANCHOR_DOMAIN}
            token={sep10Token}
            lockedQuote={lockedQuote}
            onQuoteLocked={setLockedQuote}
          />
        </div>

        {publicKey && sep10Token && (
          <TransferPanel
            anchorDomain={ANCHOR_DOMAIN}
            publicKey={publicKey}
            token={sep10Token}
            lockedQuote={lockedQuote}
          />
        )}
      </main>

      <footer className="border-t border-white/10 px-8 py-6 text-center text-xs text-zinc-600">
        Stellar Testnet only · Non-custodial by design
      </footer>
    </div>
  );
}
