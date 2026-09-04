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

/**
 * Resolves the base URL this instance is actually reachable at, for
 * building stellar.toml's advertised SEP endpoint URLs.
 *
 * `NEXT_PUBLIC_APP_URL` alone isn't reliable for this on a preview/staging
 * Vercel deployment (a different URL per deployment) unless explicitly set
 * per-environment — so the request's own `Host` / `X-Forwarded-Proto`
 * headers (what the edge that terminated *this* request actually reports)
 * are the self-correcting fallback, same reasoning as
 * mock-anchor/publicBaseUrl.js.
 */
export function resolveMockAnchorBaseUrl(req: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.trim().replace(/\/+$/, "");

  const host = (req.headers.get("host") || HOME_DOMAIN).trim();
  const hostname = host.split(":")[0];
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const proto = forwardedProto ? forwardedProto.split(",")[0].trim() : isLocalHostname(hostname) ? "http" : "https";
  return `${proto}://${host}`;
}

/**
 * Loads a Testnet keypair from an env var secret, or lazily generates and
 * Friendbot-funds a fresh one on first use if unset.
 *
 * Important scope note for the generated-fallback path: it's memoized
 * per-module (i.e. per warm serverless instance), so it's stable for every
 * request that instance handles — but a *different* cold-started instance
 * generates its *own* random keypair independently. SEP-10 requires the
 * anchor's signing key to be the same one that issued a challenge and the
 * one that later verifies it, so an unpinned secret only produces reliably
 * correct behavior on a single long-lived process (`next dev`, or a Vercel
 * deployment that happens to stay on one warm instance for a demo). Before
 * relying on this for a multi-instance or long-running production
 * deployment, set `MOCK_ANCHOR_SIGNING_SECRET` / `MOCK_ANCHOR_TRY_ISSUER_SECRET`
 * explicitly — see docs/RUNBOOK.md.
 */
async function loadOrGenerateKeypair(envVar: string, label: string): Promise<Keypair> {
  const secret = process.env[envVar];
  if (secret) return Keypair.fromSecret(secret);

  const kp = Keypair.random();
  console.warn(
    `[mock-anchor] ${envVar} not set — generated an EPHEMERAL ${label} keypair (public: ${kp.publicKey()}). ` +
      `This is only stable within this warm serverless instance; pin ${envVar} in your Vercel environment before relying on this across deployments or cold starts.`
  );
  try {
    const res = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
    if (!res.ok) {
      console.warn(`[mock-anchor] Friendbot funding failed for ${label} (${res.status}) — fund it manually if needed.`);
    }
  } catch (err) {
    console.warn(`[mock-anchor] Friendbot funding request failed for ${label}:`, err);
  }
  return kp;
}

/**
 * The receiving account can't accept a SEP-31 sender's EURC payment without
 * first trusting the asset. Checked and established idempotently on first
 * use so it can't be missed — one Horizon read, and a ChangeTrust submit
 * only when actually missing.
 */
async function ensureEurcTrustline(keypair: Keypair): Promise<void> {
  const server = getHorizonServer();
  const account = await server.loadAccount(keypair.publicKey());
  const alreadyTrusts = account.balances.some(
    (b) => "asset_code" in b && b.asset_code === "EURC" && b.asset_issuer === EURC_ISSUER
  );
  if (alreadyTrusts) return;

  console.log("[mock-anchor] receiving account has no EURC trustline yet — establishing one...");
  const tx = new TransactionBuilder(account, { fee: "10000", networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset: new Asset("EURC", EURC_ISSUER) }))
    .setTimeout(60)
    .build();
  tx.sign(keypair);
  const res = await server.submitTransaction(tx);
  console.log(`[mock-anchor] EURC trustline established: ${res.hash}`);
}

let signingKeypairReady: Promise<Keypair> | null = null;
/** The mock anchor's SEP-10 signing key, which doubles as the EURC-receiving account for SEP-31 settlement. */
export function getSigningKeypair(): Promise<Keypair> {
  if (!signingKeypairReady) {
    signingKeypairReady = loadOrGenerateKeypair("MOCK_ANCHOR_SIGNING_SECRET", "SEP-10 signing / EURC receiving").then(
      async (kp) => {
        await ensureEurcTrustline(kp);
        return kp;
      }
    );
  }
  return signingKeypairReady;
}

let tryIssuerKeypairReady: Promise<Keypair> | null = null;
/** The mock anchor's self-issued TRY asset issuer — NOT a real, fiat-backed currency. See CORRIDOR_VERIFICATION.md §5. */
export function getTryIssuerKeypair(): Promise<Keypair> {
  if (!tryIssuerKeypairReady) {
    tryIssuerKeypairReady = loadOrGenerateKeypair("MOCK_ANCHOR_TRY_ISSUER_SECRET", "mock TRY issuer");
  }
  return tryIssuerKeypairReady;
}

export function getJwtSecret(): string {
  return process.env.MOCK_ANCHOR_JWT_SECRET || "ferry-embedded-mock-anchor-dev-secret-not-for-production";
}
