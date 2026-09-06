import { Asset, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import type { NextRequest } from "next/server";
import { getHorizonServer, EURC_ISSUER, HOME_DOMAIN, isLocalHostname } from "@/lib/stellar/config";

/**
 * Config and Testnet identity for the embedded mock anchor
 * (`app/api/mock-anchor/*`, `app/.well-known/stellar.toml`).
 *
 * This is the Vercel-deployable equivalent of `mock-anchor/`'s standalone
 * Express server — same simulated TRY leg, same "NOT a real fiat-backed
 * asset, NOT a licensed anchor" scope, ported so it runs inside Ferry's own
 * Next.js app instead of a separate always-on Node process (which Vercel's
 * serverless model has nowhere to host). See CORRIDOR_VERIFICATION.md §5
 * before treating anything here as more than a Testnet test harness.
 */

export const EMBEDDED_MOCK_ANCHOR_ENABLED = process.env.NEXT_PUBLIC_ENABLE_EMBEDDED_MOCK_ANCHOR === "true";

// Illustrative, fixed mock rate — not a live FX feed. Stated plainly so
// nobody mistakes this for a real quoted market rate. Mirrors
// mock-anchor/server.js's own MOCK_EURC_TRY_RATE exactly.
export const MOCK_EURC_TRY_RATE = 44.5;

// Testnet-friendly amount range — see mock-anchor/server.js's own comment:
// real Testnet EURC is scarce, so the minimum stays low enough that
// dust-sized real balances are actually usable end-to-end.
export const MIN_EURC_AMOUNT = 0.0001;
export const MAX_EURC_AMOUNT = 1000;

export function amountOutOfRange(amount: number): boolean {
  return !(amount >= MIN_EURC_AMOUNT && amount <= MAX_EURC_AMOUNT);
}

export { EURC_ISSUER };

function protoFor(hostname: string, forwardedProto: string | null): string {
  if (forwardedProto) return forwardedProto.split(",")[0].trim();
  return isLocalHostname(hostname) ? "http" : "https";
}

/**
 * Resolves the base URL this instance is actually reachable at, for
 * building stellar.toml's advertised SEP endpoint URLs.
 *
 * Prefers the incoming request's own `Host` header — this needs no
 * environment variable at all, is always present on a real HTTP request,
 * and is exactly "what domain was this request addressed to," which is
 * precisely what's needed here. `NEXT_PUBLIC_APP_URL` was tried first in
 * an earlier version of this function; on one real deployment it
 * persistently resolved to a corrupted value (wrapped as
 * `[https://...](https://...)`) across multiple dashboard edits,
 * deletions, and cache-free rebuilds, for a reason never fully explained
 * from here — Vercel's own automatically-populated variables
 * (`VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL`) and the request's own
 * headers were verified clean throughout that same debugging session
 * (see git history around 2026-09), which is why they're trusted first
 * below instead.
 */
export function resolveMockAnchorBaseUrl(req: NextRequest): string {
  const host = req.headers.get("host");
  if (host) {
    const trimmedHost = host.trim();
    const hostname = trimmedHost.split(":")[0];
    return `${protoFor(hostname, req.headers.get("x-forwarded-proto"))}://${trimmedHost}`;
  }

  // No Host header at all shouldn't happen for a real HTTP request — this
  // is a last-resort fallback chain, in the same reliability order as
  // above: Vercel's own automatic variables before an operator-set
  // NEXT_PUBLIC_APP_URL.
  const prodUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prodUrl) return `https://${prodUrl.trim().replace(/\/+$/, "")}`;
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.trim().replace(/\/+$/, "")}`;
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.trim().replace(/\/+$/, "");
  return `${protoFor(HOME_DOMAIN, null)}://${HOME_DOMAIN}`;
}

/**
 * Loads a Testnet keypair from an env var secret, synchronously, and
 * NEVER THROWS: an unset var generates a fresh ephemeral keypair (loudly
 * logged), and a *set but malformed* secret (fails `Keypair.fromSecret`'s
 * own checksum/format validation) is caught, logged as an explicit error
 * naming the exact env var and the underlying reason, and falls back to
 * the same ephemeral-generation path rather than crashing every route
 * that needs a keypair.
 *
 * Deliberately does no network I/O (no Friendbot funding, no Horizon
 * lookup) — SEP-10 challenge signing doesn't require the signing account
 * to exist on Testnet at all (it uses Stellar's sequence-number-0
 * unfunded-source-account convention), and the TRY issuer key never signs
 * anything in this build (the optional demo payout leg wasn't ported —
 * see docs/RUNBOOK.md). Funding/trustline setup, where actually needed
 * (before a sender can pay the SEP-31 settlement account), is a separate,
 * best-effort step — see `ensureSigningAccountFunded()` below. Coupling
 * that network-dependent step into *every* route that merely needed a
 * public key (including `/.well-known/stellar.toml` and `/health`, which
 * have no reason to depend on Horizon at all) is what previously made an
 * unrelated Friendbot/Horizon hiccup take down toml resolution itself.
 *
 * Scope note for the generated-fallback path, still real: memoized
 * per-module, i.e. per warm serverless instance/function — Vercel likely
 * bundles each API route as its own function, so *different* routes can
 * independently generate *different* ephemeral keys, not just different
 * cold starts of the same route. SEP-10 requires the same signing key
 * across challenge-issue and challenge-verify, so an unpinned secret only
 * produces reliably correct behavior on a single long-lived process
 * (`next dev`). Pin `MOCK_ANCHOR_SIGNING_SECRET` / `MOCK_ANCHOR_TRY_ISSUER_SECRET`
 * before treating a Vercel deployment as demo-ready — see docs/RUNBOOK.md.
 */
function loadKeypair(envVar: string, label: string): Keypair {
  const secret = process.env[envVar];
  if (secret) {
    try {
      return Keypair.fromSecret(secret);
    } catch (err) {
      console.error(
        `[mock-anchor] ${envVar} is set but is not a valid Stellar secret key (${err instanceof Error ? err.message : err}). ` +
          `Falling back to an ephemeral generated keypair — fix ${envVar} in your Vercel environment (Project → Settings → Environment Variables).`
      );
    }
  }

  const kp = Keypair.random();
  console.warn(
    `[mock-anchor] ${envVar} not set — generated an EPHEMERAL ${label} keypair (public: ${kp.publicKey()}). ` +
      `This is only stable within this warm serverless instance/function; pin ${envVar} in your Vercel environment before relying on this across deployments or cold starts.`
  );
  return kp;
}

let signingKeypair: Keypair | null = null;
let signingKeypairPinned = false;
/** The mock anchor's SEP-10 signing key, which doubles as the EURC-receiving account for SEP-31 settlement. Synchronous, never throws — see loadKeypair(). */
export function getSigningKeypair(): Keypair {
  if (!signingKeypair) {
    signingKeypairPinned = Boolean(process.env.MOCK_ANCHOR_SIGNING_SECRET);
    signingKeypair = loadKeypair("MOCK_ANCHOR_SIGNING_SECRET", "SEP-10 signing / EURC receiving");
  }
  return signingKeypair;
}

let tryIssuerKeypair: Keypair | null = null;
/** The mock anchor's self-issued TRY asset issuer — NOT a real, fiat-backed currency. See CORRIDOR_VERIFICATION.md §5. Synchronous, never throws. */
export function getTryIssuerKeypair(): Keypair {
  if (!tryIssuerKeypair) {
    tryIssuerKeypair = loadKeypair("MOCK_ANCHOR_TRY_ISSUER_SECRET", "mock TRY issuer");
  }
  return tryIssuerKeypair;
}

export function getJwtSecret(): string {
  return process.env.MOCK_ANCHOR_JWT_SECRET || "ferry-embedded-mock-anchor-dev-secret-not-for-production";
}

export interface SigningAccountReadiness {
  fundedAndTrusting: boolean;
  /** Human-readable reason, present only when fundedAndTrusting is false. */
  reason?: string;
}

/**
 * Best-effort: makes sure the signing/receiving account actually exists on
 * Testnet and trusts EURC, so a sender's SEP-31 settlement payment to it
 * can succeed. Unlike key loading above, this DOES need network I/O
 * (Friendbot funding for a freshly generated keypair, then a Horizon
 * read, then a ChangeTrust submit if missing) — so unlike
 * getSigningKeypair(), this can genuinely fail (Friendbot down/rate
 * limited, Horizon slow). It NEVER throws: callers get a typed
 * `{ fundedAndTrusting, reason }` back and decide what to do (the SEP-31
 * create route, the only caller that actually needs this today, returns a
 * clear, retryable 503 naming the reason rather than handing back a
 * settlement account that's silently unusable).
 *
 * Memoized as a promise that only caches *success* — a failed attempt is
 * not remembered, so the next call (e.g. the sender retrying "Send") gets
 * a fresh attempt instead of a permanently cached rejection.
 */
let fundingReady: Promise<SigningAccountReadiness> | null = null;
export function ensureSigningAccountFunded(): Promise<SigningAccountReadiness> {
  if (!fundingReady) {
    fundingReady = (async (): Promise<SigningAccountReadiness> => {
      const keypair = getSigningKeypair();
      const server = getHorizonServer();

      if (!signingKeypairPinned) {
        try {
          await fetch(`https://friendbot.stellar.org/?addr=${keypair.publicKey()}`);
        } catch (err) {
          console.warn("[mock-anchor] Friendbot funding request failed for the signing account:", err);
          // Keep going — the account may already exist from a previous
          // attempt on this instance; the loadAccount check below is the
          // real source of truth, not Friendbot's own response.
        }
      }

      // Horizon can briefly lag right after a Friendbot funding tx lands —
      // a few short retries absorbs that instead of treating it as a hard
      // failure on the very next request.
      let account;
      for (let attempt = 0; ; attempt++) {
        try {
          account = await server.loadAccount(keypair.publicKey());
          break;
        } catch (err) {
          if (attempt >= 2) {
            const reason = signingKeypairPinned
              ? `MOCK_ANCHOR_SIGNING_SECRET's account (${keypair.publicKey()}) doesn't exist on Testnet yet — fund it via https://friendbot.stellar.org/?addr=${keypair.publicKey()}`
              : `Friendbot funding hasn't propagated yet for the generated account (${keypair.publicKey()}) — this usually resolves on retry within a few seconds`;
            console.error(`[mock-anchor] ensureSigningAccountFunded failed: ${reason}`, err);
            return { fundedAndTrusting: false, reason };
          }
          await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
        }
      }

      const alreadyTrusts = account.balances.some(
        (b) => "asset_code" in b && b.asset_code === "EURC" && b.asset_issuer === EURC_ISSUER
      );
      if (alreadyTrusts) return { fundedAndTrusting: true };

      try {
        console.log("[mock-anchor] receiving account has no EURC trustline yet — establishing one...");
        const tx = new TransactionBuilder(account, { fee: "10000", networkPassphrase: Networks.TESTNET })
          .addOperation(Operation.changeTrust({ asset: new Asset("EURC", EURC_ISSUER) }))
          .setTimeout(60)
          .build();
        tx.sign(keypair);
        const res = await server.submitTransaction(tx);
        console.log(`[mock-anchor] EURC trustline established: ${res.hash}`);
        return { fundedAndTrusting: true };
      } catch (err) {
        const reason = `Failed to establish the EURC trustline for ${keypair.publicKey()}: ${err instanceof Error ? err.message : err}`;
        console.error(`[mock-anchor] ${reason}`);
        return { fundedAndTrusting: false, reason };
      }
    })();

    // Only cache success — a failure should be retryable on the next call,
    // not a permanent rejection for the rest of this instance's lifetime.
    fundingReady.then((result) => {
      if (!result.fundedAndTrusting) fundingReady = null;
    });
  }
  return fundingReady;
}
