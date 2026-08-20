"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAddress,
  getNetworkDetails,
  isAllowed,
  isConnected,
  requestAccess,
  WatchWalletChanges,
} from "@stellar/freighter-api";
import { Networks } from "@stellar/stellar-sdk";
import { freighterErrorMessage } from "@/lib/stellar/freighterError";
import { NETWORK_PASSPHRASE } from "@/lib/stellar/config";

interface WalletConnectProps {
  onConnect?: (publicKey: string) => void;
  onDisconnect?: () => void;
}

const WATCH_INTERVAL_MS = 3000;

// Freighter reports the connected network as one of its own short labels
// ("TESTNET", "PUBLIC", ...), not the full passphrase. Map Ferry's
// configured NETWORK_PASSPHRASE (lib/stellar/config.ts — the single value
// that actually changes at Mainnet cutover, per docs/RUNBOOK.md §2.1) to
// the label Freighter is expected to report, instead of hardcoding
// "TESTNET" here — a literal that would incorrectly reject a correctly
// Mainnet-configured Freighter session once NETWORK_PASSPHRASE is switched.
const FREIGHTER_NETWORK_LABELS: Record<string, string> = {
  [Networks.PUBLIC]: "PUBLIC",
  [Networks.TESTNET]: "TESTNET",
  [Networks.FUTURENET]: "FUTURENET",
  [Networks.STANDALONE]: "STANDALONE",
};
const EXPECTED_FREIGHTER_NETWORK = FREIGHTER_NETWORK_LABELS[NETWORK_PASSPHRASE] ?? null;

/**
 * Connects to the user's Freighter wallet extension. Ferry never requests,
 * stores, or handles a secret key — `requestAccess` only ever returns a
 * public address, and all signing later happens inside the extension.
 *
 * Also watches for the account or network changing *inside* Freighter
 * after connection (e.g. the user switches accounts without clicking
 * Ferry's "Disconnect"). Without this, Ferry's UI would keep showing a
 * stale address while any subsequent signature actually came from a
 * different account — `onConnect` fires again with the new address so the
 * caller (app/page.tsx) can invalidate any session state tied to the old
 * one.
 */
export default function WalletConnect({ onConnect, onDisconnect }: WalletConnectProps) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

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
      // If EXPECTED_FREIGHTER_NETWORK is null, NETWORK_PASSPHRASE is a
      // custom/unrecognized value (e.g. a private network) — skip this
      // check rather than guessing, instead of wrongly blocking it.
      if (!network.error && network.network && EXPECTED_FREIGHTER_NETWORK && network.network !== EXPECTED_FREIGHTER_NETWORK) {
        throw new Error(`Freighter is set to ${network.network}. Switch it to ${EXPECTED_FREIGHTER_NETWORK} to use Ferry.`);
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
    setNetworkWarning(null);
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

  // Live sync: detect an account or network switch made inside Freighter
  // itself while Ferry is already connected. Freighter has no push-based
  // event for this, so WatchWalletChanges polls on our behalf.
  useEffect(() => {
    if (!publicKey) return;

    const watcher = new WatchWalletChanges(WATCH_INTERVAL_MS);
    watcher.watch(({ address, network, error: watchError }) => {
      if (watchError) return;

      if (address && address !== publicKey) {
        setPublicKey(address);
        onConnect?.(address);
      }

      setNetworkWarning(
        network && network !== "TESTNET" ? `Freighter switched to ${network}. Switch back to Testnet to continue.` : null
      );
    });

    return () => watcher.stop();
  }, [publicKey, onConnect]);

  if (publicKey) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="font-mono text-sm text-emerald-300">{truncateAddress(publicKey)}</span>
          <button onClick={disconnect} className="text-xs text-zinc-400 transition-colors hover:text-zinc-200">
            Disconnect
          </button>
        </div>
        {networkWarning && <p className="max-w-xs text-right text-xs text-amber-400">{networkWarning}</p>}
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
