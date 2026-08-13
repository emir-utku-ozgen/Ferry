"use client";

import { useEffect, useState } from "react";
import WalletConnect from "@/components/WalletConnect";
import RemittanceFlow from "@/components/RemittanceFlow";
import QuoteCalculator from "@/components/QuoteCalculator";
import TransferPanel from "@/components/TransferPanel";
import StatusTracker, { type FlowError, type KycStatus } from "@/components/StatusTracker";
import KycModal from "@/components/KycModal";
import NonCustodialNotice from "@/components/NonCustodialNotice";
import { ANCHOR_DOMAIN } from "@/lib/stellar/config";
import type { FirmQuote } from "@/lib/stellar/client/sep38Client";
import { fetchCustomerInfo } from "@/lib/stellar/client/sep12Client";

export default function Home() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [sep10Token, setSep10Token] = useState<string | null>(null);
  const [lockedQuote, setLockedQuote] = useState<FirmQuote | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatus>("not_started");
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<FlowError | null>(null);
  const [now, setNow] = useState(() => Date.now());

  function resetSession() {
    setSep10Token(null);
    setLockedQuote(null);
    setKycStatus("not_started");
    setKycModalOpen(false);
    setTransferStatus(null);
    setFlowError(null);
  }

  // Fired on initial connect AND on a live account switch inside Freighter
  // (see components/WalletConnect.tsx's WatchWalletChanges watcher). Any
  // session state — the SEP-10 token above all — was issued for whichever
  // account was previously connected, so a *different* incoming address
  // invalidates it; the same address reconnecting (e.g. page reload
  // re-hydration) does not.
  function handleWalletUpdate(newPublicKey: string) {
    if (publicKey && publicKey !== newPublicKey) {
      resetSession();
    }
    setPublicKey(newPublicKey);
  }

  function handleDisconnect() {
    setPublicKey(null);
    resetSession();
  }

  // Best-effort initial KYC status check once authenticated, so a
  // returning/already-verified sender doesn't see "not started" for no
  // reason. Silent on failure — the KYC modal itself surfaces real errors.
  useEffect(() => {
    if (!publicKey || !sep10Token) return;
    let cancelled = false;
    fetchCustomerInfo(ANCHOR_DOMAIN, sep10Token, publicKey)
      .then((info) => {
        if (!cancelled) setKycStatus(info.status);
      })
      .catch(() => {
        /* anchor may not support SEP-12, or the lookup failed transiently */
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey, sep10Token]);

  // Ticked once a second so `quoteExpired` (read during render below)
  // updates on its own instead of calling the impure `Date.now()` directly
  // in the render body.
  useEffect(() => {
    if (!lockedQuote) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [lockedQuote]);

  const quoteExpired = lockedQuote ? now >= new Date(lockedQuote.expires_at).getTime() : false;

  return (
    <div className="flex flex-1 flex-col bg-black">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-6">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">Ferry</span>
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            Testnet
          </span>
        </div>
        <WalletConnect onConnect={handleWalletUpdate} onDisconnect={handleDisconnect} />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-8 py-16">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            EUR → TRY remittances, orchestrated&nbsp;— never custodied.
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-zinc-400">
            Ferry connects your Freighter wallet to Stellar-anchored remittance rails via SEP-10, SEP-12, SEP-24,
            SEP-31 and SEP-38 to move EUR in and pay out Turkish Lira (TRY). Funds and identity documents always
            stay with the licensed anchor.
          </p>
        </div>

        <NonCustodialNotice />

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
          <StatusTracker
            hasQuote={Boolean(lockedQuote)}
            quoteExpired={quoteExpired}
            kycStatus={kycStatus}
            transferStatus={transferStatus}
            error={flowError}
          />
        )}

        {publicKey && sep10Token && (
          <TransferPanel
            anchorDomain={ANCHOR_DOMAIN}
            publicKey={publicKey}
            token={sep10Token}
            lockedQuote={lockedQuote}
            kycStatus={kycStatus}
            onOpenKyc={() => setKycModalOpen(true)}
            onTransferStatusChange={setTransferStatus}
            onFlowError={setFlowError}
          />
        )}
      </main>

      {kycModalOpen && publicKey && sep10Token && (
        <KycModal
          anchorDomain={ANCHOR_DOMAIN}
          publicKey={publicKey}
          token={sep10Token}
          onClose={() => setKycModalOpen(false)}
          onStatusChange={setKycStatus}
        />
      )}

      <footer className="border-t border-white/10 px-8 py-6 text-center text-xs text-zinc-600">
        Stellar Testnet only · Non-custodial by design
      </footer>
    </div>
  );
}
