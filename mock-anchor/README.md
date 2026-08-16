# Ferry mock anchor

A minimal, local SEP-1/10/12/38/31 server standing in for the TRY side of Ferry's EUR(EURC)→TRY corridor, because **no public TRY-issuing anchor exists on Stellar Testnet**. See `CORRIDOR_VERIFICATION.md` §5 in the repo root for the full transparency statement this exists to support.

## What this is — and, just as importantly, what it isn't

This is **not** a production anchor implementation, and not a stand-in for the [official Stellar Anchor Platform](https://developers.stellar.org/docs/category/anchor-platform). It's a purpose-built, ~350-line Express server implementing exactly enough of five SEPs to let Ferry run a real, honest EURC→TRY quote-and-payment flow against something on Testnet:

| SEP | Implemented | Not implemented |
|---|---|---|
| SEP-1 (`stellar.toml`) | Yes — signing key, endpoints, currency metadata | — |
| SEP-10 (Web Auth) | Yes, using `@stellar/stellar-sdk`'s own `WebAuth.buildChallengeTx` / `readChallengeTx` for correctness | Full on-chain signer-weight verification (see the code comment above the `/auth` POST handler) |
| SEP-12 (KYC) | Yes — a minimal in-memory record per account | Real identity verification of any kind. Every submission is accepted immediately. |
| SEP-38 (Quotes) | Yes — EURC→TRY only, at a fixed, clearly-illustrative rate | A live FX feed. `MOCK_EURC_TRY_RATE` in `server.js` is a constant, not a market price. |
| SEP-31 (Direct Payments) | Yes — transaction creation, plus a background poller that detects the sender's real EURC payment | SEP-24 (hosted deposit/withdrawal) — not needed for this corridor's SEP-31 path, so deliberately out of scope |

Everything is **in-memory**. Restarting the process forgets every customer record, quote, and transaction — intentional, matching Ferry's own `lib/idempotency.ts` / `lib/auditTrail.ts` design philosophy of stating scope limits plainly rather than hiding them.

## The one thing that's genuinely real: EURC

The EUR leg of the corridor is **Circle's actual EURC** on Stellar Testnet (issuer `GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO`, verified independently — see `CORRIDOR_VERIFICATION.md` §5.1). A sender using this mock anchor sends a real, transferable Testnet asset. Only the TRY side — the asset code, the issuer, the "anchor" itself — is simulated.

## The "TRY payout" is a demonstration artifact, not a real payout

A real SEP-31 receiving anchor pays out fiat via a bank wire once it receives the sender's on-chain payment — that payout has **no Stellar transaction at all**. This mock harness has no bank rail to simulate that with. So, purely to give a verification run a second checkable testnet transaction hash (one per leg of the corridor), it can *optionally* send a small amount of its own mock `TRY` asset on-chain once a transaction completes. This only happens if `MOCK_PAYOUT_DEMO_ACCOUNT` is set in `.env` — it's off by default, and even when on, it's explicitly a demo artifact, not a claim that real SEP-31 payouts produce a Stellar transaction. Don't read a `payout_stellar_transaction_id` on a completed transaction as "how real TRY delivery works."

## Running it

```bash
cd mock-anchor
npm install
cp .env.example .env   # optional — leave secrets blank to auto-generate + Friendbot-fund fresh keys on boot
npm start
```

On first boot with no `SIGNING_SECRET` / `TRY_ISSUER_SECRET` set, the server generates fresh Testnet keypairs, funds them via Friendbot, and prints them once — copy them into `.env` if you want the same anchor identity across restarts. `HOME_DOMAIN` defaults to `localhost:4001`, matching `PORT`.

**You don't strictly need to, though.** Ferry's frontend discovers this server's actual `TRY` issuer at request time from its own `stellar.toml` (`GET /api/anchor/currencies`, `lib/stellar/client/anchorClient.ts`) rather than assuming a fixed, hardcoded issuer — so restarting this server with a *different* freshly-generated TRY keypair still works against Ferry without any frontend config change. Pinning the keys in `.env` is still worth doing if you want a stable identity to reference across sessions (e.g. in `TESTNET_HASHES.md`-style evidence), not because Ferry requires it to function.

## Pointing Ferry at it

Set these in Ferry's own environment (not `mock-anchor/.env`):

```
NEXT_PUBLIC_ANCHOR_DOMAIN=localhost:4001
ANCHOR_ALLOWLIST=localhost:4001
```

A full URL (`http://localhost:4001`) works too for either variable — `lib/stellar/config.ts` and `lib/stellar/anchorAllowlist.ts` both strip a leading `http://`/`https://` before comparing or resolving.

`lib/stellar/toml.ts` has a narrow exception permitting plain-HTTP `stellar.toml` resolution for `localhost`/`127.0.0.1` domains specifically (this server has no TLS certificate) — every other domain still requires HTTPS exactly as before. That same module also caches a resolved `stellar.toml` for only 15 seconds for local domains (5 minutes for everything else) — specifically so restarting this server mid-session doesn't leave Ferry's dev server serving a stale toml (and therefore a stale TRY issuer) for the rest of its process lifetime. If you also want the existing USD/CAD → USDC/XLM/SRT pairs to keep working against the public reference anchor in the same session, include both domains in `ANCHOR_ALLOWLIST` (comma-separated) — but only one can be `NEXT_PUBLIC_ANCHOR_DOMAIN` at a time, since that's the single anchor Ferry's UI currently targets for every pairing (see `docs/RUNBOOK.md` §2 for the full config reference).

## Why a custom mock instead of the real Anchor Platform

The official reference Anchor Platform is a real, production-grade multi-service stack (Postgres, Kafka, a business-logic callback server you implement yourself) — genuinely valuable for a team building a production anchor, but disproportionate for "let Ferry demonstrate a EURC→TRY flow on Testnet." This mock is small enough to read start to finish in a few minutes, has no external service dependencies beyond Stellar Testnet itself, and is committed here specifically so this test is reproducible rather than a one-off.
