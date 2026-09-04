"use client";

import { useCallback, useState } from "react";
import { signTransaction } from "@stellar/freighter-api";
import { exchangeSep10Token, fetchSep10Challenge } from "@/lib/stellar/client/sep10Client";
import { freighterErrorMessage } from "@/lib/stellar/freighterError";
import Spinner from "@/components/Spinner";

interface RemittanceFlowProps {
  publicKey: string | null;
  anchorDomain: string;
  token: string | null;
  onAuthenticated: (token: string) => void;
  hasQuote: boolean;
}

const STEPS = [
  { key: "connect", label: "Connect Wallet" },
  { key: "authenticate", label: "SEP-10 Authenticate" },
  { key: "quote", label: "SEP-38 Quote" },
  { key: "transfer", label: "SEP-24 / SEP-31 Transfer" },
] as const;

/**
 * Drives the SEP-10 Web Auth handshake and renders the overall step
 * tracker. Signing happens entirely inside the Freighter extension — this
 * component only ever sees XDR strings, never a secret key.
 */
export default function RemittanceFlow({ publicKey, anchorDomain, token, onAuthenticated, hasQuote }: RemittanceFlowProps) {
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIndex = !publicKey ? 0 : !token ? 1 : !hasQuote ? 2 : 3;

  const authenticate = useCallback(async () => {
    if (!publicKey) return;
    setAuthenticating(true);
    setError(null);
    try {
      const challenge = await fetchSep10Challenge(anchorDomain, publicKey);

      const signed = await signTransaction(challenge.transaction, {
        networkPassphrase: challenge.network_passphrase,
        address: publicKey,
      });
      if (signed.error) {
        throw new Error(freighterErrorMessage(signed.error, "Freighter declined to sign the SEP-10 challenge"));
      }

      const newToken = await exchangeSep10Token(anchorDomain, signed.signedTxXdr);
      onAuthenticated(newToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "SEP-10 authentication failed");
    } finally {
      setAuthenticating(false);
    }
  }, [publicKey, anchorDomain, onAuthenticated]);

  return (
    <div className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl transition-colors duration-200 hover:border-white/[0.12]">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Remittance Flow</h2>

      <ol className="mt-4 flex flex-col gap-3">
        {STEPS.map((step, i) => {
          const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
                  state === "done"
                    ? "bg-emerald-500 text-black shadow-[0_0_12px_-2px_rgba(16,185,129,0.7)]"
                    : state === "active"
                      ? "border border-white text-white shadow-[0_0_10px_-2px_rgba(255,255,255,0.5)]"
                      : "border border-white/15 text-zinc-600"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span className={state === "pending" ? "text-sm text-zinc-600" : "text-sm text-zinc-200"}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {publicKey && !token && (
        <div className="mt-4 flex flex-col items-start gap-2">
          <button
            onClick={authenticate}
            disabled={authenticating}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-all duration-150 hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-60 disabled:active:scale-100"
          >
            {authenticating && <Spinner className="h-3.5 w-3.5 text-black" />}
            {authenticating ? "Waiting for Freighter signature…" : "Authenticate (SEP-10)"}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}

      {token && (
        <div className="animate-fade-in mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
          <p className="text-xs text-zinc-500">SEP-10 session token</p>
          <p className="mt-1 truncate font-mono text-xs text-emerald-300">{token}</p>
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
        Ferry is strictly non-custodial: identity documents and funds always stay with the licensed anchor via
        its hosted (SEP-24) or direct (SEP-31) handoff — this app only orchestrates the handshake.
      </p>
    </div>
  );
}
