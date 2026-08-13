"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAddress,
  getNetworkDetails,
  isAllowed,
  isConnected,
  requestAccess,
} from "@stellar/freighter-api";
import { freighterErrorMessage } from "@/lib/stellar/freighterError";

interface WalletConnectProps {
  onConnect?: (publicKey: string) => void;
  onDisconnect?: () => void;
}

/**
 * Connects to the user's Freighter wallet extension. Ferry never requests,
 * stores, or handles a secret key — `requestAccess` only ever returns a
 * public address, and all signing later happens inside the extension.
 */
export default function WalletConnect({ onConnect, onDisconnect }: WalletConnectProps) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const connected = await isConnected();
      if (connected.error || !connected.isConnected) {
        throw new Error("Freighter extension not detected. Install it from freighter.app.");
      }

      const access = await requestAccess();
      if (access.error) throw new Error(freighterErrorMessage(access.error, "Freighter declined the connection request"));

      const network = await getNetworkDetails();
      if (!network.error && network.network && network.network !== "TESTNET") {
        throw new Error(`Freighter is set to ${network.network}. Switch it to Testnet to use Ferry.`);
      }

      setPublicKey(access.address);
      onConnect?.(access.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, [onConnect]);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setError(null);
    onDisconnect?.();
  }, [onDisconnect]);

  // Re-hydrate an already-approved connection on load, without a popup.
  useEffect(() => {
    (async () => {
      try {
        const allowed = await isAllowed();
        if (allowed.error || !allowed.isAllowed) return;
        const address = await getAddress();
        if (!address.error && address.address) {
          setPublicKey(address.address);
          onConnect?.(address.address);
        }
      } catch {
        // Freighter not installed or user hasn't connected yet — ignore.
      }
    })();
    // Only run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (publicKey) {
    return (
      <div className="flex items-center gap-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="font-mono text-sm text-emerald-300">{truncateAddress(publicKey)}</span>
        <button onClick={disconnect} className="text-xs text-zinc-400 transition-colors hover:text-zinc-200">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={connect}
        disabled={connecting}
        className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
      >
        {connecting ? "Connecting…" : "Connect Freighter Wallet"}
      </button>
      {error && <p className="max-w-xs text-right text-xs text-red-400">{error}</p>}
    </div>
  );
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
