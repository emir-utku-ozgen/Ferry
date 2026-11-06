"use client";

import { useEffect, useReducer, useState } from "react";
import Image from "next/image";
import WalletConnect from "@/components/WalletConnect";
import RemittanceFlow from "@/components/RemittanceFlow";
import QuoteCalculator from "@/components/QuoteCalculator";
import TransferPanel from "@/components/TransferPanel";
import StatusTracker, { type FlowError, type KycStatus } from "@/components/StatusTracker";
import KycModal from "@/components/KycModal";
import { ANCHOR_DOMAIN } from "@/lib/stellar/config";
import type { FirmQuote } from "@/lib/stellar/client/sep38Client";
import { fetchCustomerInfo } from "@/lib/stellar/client/sep12Client";
import { initialTransferState, transferReducer } from "@/lib/transferMachine";

export default function Home() {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [transfer, dispatch] = useReducer(transferReducer, initialTransferState);
  const { sep10Token, lockedQuote, kycStatus, transferStatus, flowError } = transfer;
  const [kycModalOpen, setKycModalOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Thin dispatch wrappers matching each child component's existing
  // callback prop signature exactly, so none of them need to change.
  function setSep10Token(token: string) {
    dispatch({ type: "AUTHENTICATED", token });
  }
  function setLockedQuote(quote: FirmQuote) {
    dispatch({ type: "QUOTE_LOCKED", quote });
  }
  function setKycStatus(status: KycStatus) {
    dispatch({ type: "KYC_STATUS_CHANGED", status });
  }
  function setTransferStatus(status: string | null) {
    dispatch({ type: "TRANSFER_STATUS_CHANGED", status });
  }
  function setFlowError(error: FlowError | null) {
    dispatch(error ? { type: "FLOW_ERROR_RAISED", error } : { type: "FLOW_ERROR_DISMISSED" });
  }

  function resetSession() {
    dispatch({ type: "SESSION_RESET" });
    setKycModalOpen(false);
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
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 flex items-center justify-between bg-black/20 px-4 py-5 backdrop-blur-md sm:px-8">
        <div className="flex items-center gap-3">
          <Image src="/brand/ferry-logo.png" alt="" width={48} height={48} priority className="h-12 w-12" />
          <span className="font-brand text-2xl tracking-tight text-white">Ferry</span>
        </div>
        <nav className="flex items-center gap-4 sm:gap-6">
          <a
            href="https://ferry-docs.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-zinc-400 transition-colors hover:text-white"
          >
            Docs
          </a>
          <WalletConnect onConnect={handleWalletUpdate} onDisconnect={handleDisconnect} />
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-8 py-16 lg:mr-auto lg:ml-[max(0px,calc(50%-24rem-7.5rem))]">
        <div className="animate-fade-in">
          <h1 className="text-4xl font-medium uppercase text-white sm:text-5xl">
            <span className="block">Know what you send.</span>
            <span className="block">Know what you receive.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-zinc-300">
            See exactly how much lira your recipient gets and lock the rate before you pay. Licensed anchors move
            the money on Stellar — Ferry never holds it.
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
          <StatusTracker
            transferId={lockedQuote?.id}
            hasQuote={Boolean(lockedQuote)}
            quoteExpired={quoteExpired}
            kycStatus={kycStatus}
            transferStatus={transferStatus}
            error={flowError}
            onDismissError={() => setFlowError(null)}
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
          transferId={lockedQuote?.id}
          onClose={() => setKycModalOpen(false)}
          onStatusChange={setKycStatus}
          onFlowError={setFlowError}
        />
      )}

      <footer className="flex flex-col items-center gap-3 border-t border-white/[0.08] px-8 py-6 text-center text-xs text-zinc-600">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <span>Stellar Testnet only · Non-custodial by design</span>
          <span aria-hidden="true">·</span>
          <a
            href="https://github.com/emir-utku-ozgen/Ferry"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-200 hover:underline"
          >
            GitHub
          </a>
        </div>
        <p className="max-w-2xl leading-relaxed text-zinc-500">
          Varial is only a Testnet signing tool, not a wallet for the sender or recipient. The sender pays in EUR
          and the recipient is paid out in TRY, both handled by licensed anchors. Varial just signs SEP-10
          authentication (and an optional trustline); no one ever holds or sends crypto directly.
        </p>
      </footer>
    </div>
  );
}
