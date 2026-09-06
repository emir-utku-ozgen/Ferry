# Ferry

**Cross-Border Remittance & Settlement Engine on Stellar Rails**

Ferry is a non-custodial orchestration layer that routes value between EURC (Euro-denominated Stellar stablecoin) and Turkish Lira (TRY) using the Stellar Ecosystem Protocol (SEP) suite — replacing correspondent-banking (SWIFT) settlement times and layered intermediary fees with a ledger-settled transfer that completes in seconds. Ferry never takes custody of funds or identity documents: every KYC record and every unit of value stays with the licensed anchor at either end of the corridor. Ferry's role is strictly the handshake — authentication, quoting, compliance handoff, and payment instruction — never the vault.

**Live Testnet deployment:** [ferry-kappa-ten.vercel.app](https://ferry-kappa-ten.vercel.app)
**Network:** Stellar Testnet (strict — see [Production Roadmap](#7-production-roadmap) for the Mainnet cutover plan)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Stellar Protocol Layer (SEP Architecture)](#2-stellar-protocol-layer-sep-architecture)
3. [Infrastructure & Engineering Problems Solved](#3-infrastructure--engineering-problems-solved)
4. [Verified Live Testnet Evidence](#4-verified-live-testnet-evidence)
5. [Setup, Environment & Deployment](#5-setup-environment--deployment)
6. [Repository Layout](#6-repository-layout)
7. [Production Roadmap](#7-production-roadmap)
8. [License & Maintainer](#8-license--maintainer)

---

## 1. Architecture Overview

Ferry is a stateless Next.js (App Router) application. Every `/api/*` route is a thin, typed proxy between a browser session and a Stellar anchor's SEP-10/12/24/31/38 endpoints — there is no database, no server-held private key for a sender or recipient, and no step where Ferry itself can move funds. Signing happens exclusively client-side through the Freighter wallet extension; Ferry's server only ever handles unsigned or already-signed XDR, never a secret key.

```
Sender (Freighter Wallet)
        │  signs XDR locally — private key never leaves the extension
        ▼
Ferry Orchestrator (Next.js API Routes)
   ├─ SEP-10  → authenticate the sender's Stellar keypair
   ├─ SEP-38  → request/lock an executable FX quote
   ├─ SEP-12  → relay KYC fields to the anchor's compliance service
   └─ SEP-31  → create the cross-border payment instruction
        │
        ▼
Receiving Anchor (SEP-1 discovered via stellar.toml)
        │  detects the on-chain EURC payment by memo, settles, pays out TRY
        ▼
Recipient (bank account, no Stellar wallet required)
```

The anchor at the far end of that chain is discovered dynamically per deployment — Ferry resolves whichever domain `ANCHOR_DOMAIN` points at via SEP-1 (`stellar.toml`) and never hardcodes anchor-specific logic. See [§3](#3-infrastructure--engineering-problems-solved) for why this deployment resolves to Ferry's own embedded anchor rather than a third party.

---

## 2. Stellar Protocol Layer (SEP Architecture)

### SEP-10 — Web Authentication
Ed25519 challenge-transaction authentication. The anchor issues a signed, unfunded-source-account challenge transaction (Stellar's sequence-number-0 convention, so no account funding is required to authenticate); the sender counter-signs it locally in Freighter; the anchor verifies both signatures and issues a short-lived, HS256-signed JWT scoped to the sender's public key. Ferry's server sees the challenge and the signed XDR — never a private key.

### SEP-38 — Anchor RFQ & Firm Quotes
A two-stage pricing model: an unauthenticated **indicative price** (`GET /price`) for the live rate-preview UI, and a SEP-10-authenticated **firm quote** (`POST /quote`) that locks the exchange rate, fee, and net payout amount for a fixed validity window before any transfer is created. The quote is the contractual price the recipient is guaranteed to receive.

```
Quote ID:     mockq_mtppla3bu3fs
Sell:         10.0000000 EURC
Rate:         1 EURC = 44.5000000 TRY
Anchor fee:   0.05 EURC
Net payout:   442.7750000 TRY
```

### SEP-12 — Customer Info (KYC/AML Ingestion)
A typed proxy for the anchor's `KYC_SERVER`: dynamic field discovery (`GET /customer` returns exactly which fields — name, email, IBAN/bank details — the anchor currently requires), submission (`PUT /customer`), and record lifecycle (`DELETE /customer/:id`). Ferry relays every field and stores none of it; identity data exists only in transit between the sender's browser and the anchor's own compliance system.

### SEP-31 — Cross-Border Direct Payments
The settlement instruction layer. Once a firm SEP-38 quote and an accepted SEP-12 record exist, Ferry creates a SEP-31 transaction with the receiving anchor (`POST /transactions`), which returns the exact on-chain destination account and a unique memo. The sender pays that account directly, on-chain, with the returned memo; the anchor matches the payment by memo, verifies the received amount covers what was invoiced, and moves the transaction to `completed`. This memo-based matching is what lets a single receiving account service many concurrent transfers safely.

---

## 3. Infrastructure & Engineering Problems Solved

### Embedded Mock Anchor Architecture
No public Stellar Testnet anchor supports the EUR(EURC)→TRY pairing, and the reference test anchor's own SEP-31 endpoint is unreliable. Rather than depending on a second, separately-hosted process, the TRY-leg anchor is implemented natively inside this Next.js application — `app/api/mock-anchor/*` and `app/.well-known/stellar.toml` — so a single Vercel deployment serves both the orchestrator and the anchor it talks to. Ferry's SEP client code (`lib/stellar/sep10.ts`, `sep12.ts`, `sep38.ts`, `sep31.ts`) is completely unaware of this: it discovers the embedded anchor through the exact same SEP-1 resolution path it would use for any external anchor.

### SSRF Protection & Domain Allowlisting
Every orchestrator route accepts a client-supplied anchor `domain` — including from the recipient claim link's own URL query string, genuinely attacker-controlled input. `lib/stellar/anchorAllowlist.ts` enforces a server-side allowlist before any outbound request is issued, computed fresh on every check (not cached at cold start) so a deployment's own domain is trusted automatically when the embedded anchor is enabled, without ever trusting an arbitrary third-party domain or a wildcard match.

### Self-Domain Resolution on Serverless/Edge
Vercel injects several automatic identity signals per deployment (`VERCEL_URL`, `VERCEL_PROJECT_PRODUCTION_URL`) alongside operator-configured ones (`NEXT_PUBLIC_APP_URL`). Base-URL resolution now trusts the incoming request's own `Host` header first — a signal that requires no environment variable at all and cannot be poisoned by a misconfigured dashboard value — falling back to Vercel's own automatic variables before an operator override. This was hardened after a live incident where an operator-set variable persistently resolved to a malformed value across multiple edits and rebuilds; the fix removes the entire class of failure rather than the single symptom.

### On-Demand Settlement Detection
A traditional anchor watches for incoming payments via a long-running background poller — infrastructure a serverless deployment doesn't have between requests. `lib/mockAnchor/checkSettlement.ts` replaces this with an on-demand check: every status poll the client already makes (`TransferPanel`'s 4-second interval while a transfer is pending) triggers a live Horizon query for a memo-matched payment, verifies the received amount meets the invoiced amount, and flips the transaction to `completed` in the same request — no separate process required.

### Defense-in-Depth on Every Anchor Call
A 10-second timeout (`AbortSignal.timeout`) bounds every outbound anchor call; idempotency keys prevent duplicate transaction creation on retry; per-route rate limiting bounds abuse; and structured logging plus a live audit trail (`GET /api/audit/[transferId]`) make every state transition inspectable.

---

## 4. Verified Live Testnet Evidence

A complete SEP-10 → SEP-38 → SEP-12 → SEP-31 → on-chain-settlement run, executed end-to-end against the production deployment above — not a local process, not a simulated result. Full trace recorded in [`TESTNET_HASHES.md`](./TESTNET_HASHES.md) §10.

| Step | Detail |
|---|---|
| Sender account | `GBIWJ73HG6WEWHZ5N6S57SIL6UXSTNTSDVY4RTGBL2Q5KVODOAOKHHJY` |
| Friendbot funding | [`39b036620f25bbeb0eec4054c36f981fe52b433f5a6a92f2fd5036eee42ce02b`](https://stellar.expert/explorer/testnet/tx/39b036620f25bbeb0eec4054c36f981fe52b433f5a6a92f2fd5036eee42ce02b) |
| EURC trustline | [`d2c1465bfcc8441e8453565d2e13172e40540c687cdfb92e18bae2d7e11d94a0`](https://stellar.expert/explorer/testnet/tx/d2c1465bfcc8441e8453565d2e13172e40540c687cdfb92e18bae2d7e11d94a0) |
| SEP-38 firm quote | `mockq_mtppla3bu3fs` — 10 EURC → 442.775 TRY @ 44.50 |
| SEP-31 transaction | `n1gs3n5q`, memo `n1gs3n5q` |
| **Settlement payment** | [`9ae604b13088fb33573820ff891b0ef197501fd74bb3905403b090a8f74206f6`](https://stellar.expert/explorer/testnet/tx/9ae604b13088fb33573820ff891b0ef197501fd74bb3905403b090a8f74206f6) — Ledger `4533916` |
| Received amount | `10.0000000 EURC` (matches invoiced amount exactly) |
| **Final status** | **`completed`** |

Every hash above is independently checkable at `https://horizon-testnet.stellar.org/transactions/<hash>` or Stellar Expert, indefinitely — this evidence does not depend on Ferry or its anchor still running.

---

## 5. Setup, Environment & Deployment

### Local Development

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build    # production build (runs the TypeScript compiler)
npm run lint      # ESLint
npm run test      # Vitest unit suite
```

### Environment Variables

Copy [`.env.local.example`](./.env.local.example) to `.env.local` and adjust as needed. Core variables:

| Variable | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_HORIZON_URL` | Horizon endpoint for account/trustline queries | `https://horizon-testnet.stellar.org` |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | Stellar network passphrase for signing | `Test SDF Network ; September 2015` |
| `NEXT_PUBLIC_HOME_DOMAIN` | Domain Ferry itself is served from (sent as SEP-10 `home_domain`) | `localhost:3000` |
| `NEXT_PUBLIC_ANCHOR_DOMAIN` | Anchor domain resolved for SEP-1 discovery | `testanchor.stellar.org` |
| `ANCHOR_ALLOWLIST` | Comma-separated domains the server will resolve at all (SSRF guard) | `testanchor.stellar.org` |
| `NEXT_PUBLIC_ENABLE_EMBEDDED_MOCK_ANCHOR` | Serves this deployment's own embedded anchor instead of an external one | unset |
| `MOCK_ANCHOR_SIGNING_SECRET` | Embedded anchor's SEP-10 signing / EURC-receiving key (pin for a stable production deployment) | generated ephemerally if unset |
| `MOCK_ANCHOR_TRY_ISSUER_SECRET` | Embedded anchor's self-issued TRY asset issuer key | generated ephemerally if unset |
| `MOCK_ANCHOR_JWT_SECRET` | Signs the embedded anchor's own SEP-10 JWTs | fixed dev default if unset |

Full reference, including the Testnet → Mainnet switching procedure and the embedded-anchor deployment path in detail, is in [`docs/RUNBOOK.md`](./docs/RUNBOOK.md).

### Deployment

Ferry deploys to Vercel with zero custom build configuration — standard Next.js git integration. When `NEXT_PUBLIC_ENABLE_EMBEDDED_MOCK_ANCHOR=true` is set, the deployment automatically resolves anchor requests against its own domain (detected via the incoming request's `Host` header, with Vercel's automatic `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL` as fallbacks) and self-allowlists — no second host to operate. Pin `MOCK_ANCHOR_SIGNING_SECRET`/`MOCK_ANCHOR_TRY_ISSUER_SECRET` before treating a deployment as demo-ready: an unpinned secret is regenerated per cold-started serverless function, which is not stable across SEP-10's own challenge-issue/challenge-verify requirement.

---

## 6. Repository Layout

```
app/
  api/                 # Orchestrator routes — SEP-10/12/24/31/38, audit, health
  api/mock-anchor/      # Embedded anchor implementation (SEP-1/10/12/31/38)
  .well-known/          # stellar.toml — embedded anchor's SEP-1 discovery document
  claim/                # Recipient-facing claim link (no Stellar wallet required)
components/              # Sender-facing UI — wallet connect, quote calculator, transfer panel
lib/stellar/             # SEP client modules, allowlist, TOML resolution, error taxonomy
lib/mockAnchor/          # Embedded anchor's config, state, settlement detection
mock-anchor/             # Standalone Express reference implementation (local/self-hosted use)
docs/                    # Runbook, refund/incident procedures, key management, go-live checklist
```

---

## 7. Production Roadmap

Ferry's architecture is deliberately stateless and non-custodial; the items below are what stand between the current Testnet build and a production pilot — tracked in detail in [`GAP_ANALYSIS.md`](./GAP_ANALYSIS.md) and [`docs/GO_LIVE_CHECKLIST.md`](./docs/GO_LIVE_CHECKLIST.md).

- **Durable state migration.** Rate limiting, idempotency caching, the audit trail, and the embedded anchor's own customer/quote/transaction records are currently in-memory and process-local — correct for a single warm serverless instance, not for horizontal scale. Migrating to a shared store (PostgreSQL for durable records, Redis for rate limiting/idempotency) is the concrete next step for each.
- **Licensed anchor integration.** The TRY leg is currently served by Ferry's own embedded mock anchor — explicitly a Testnet development harness, not a fiat-backed asset or a licensed money-transmission entity. Production requires a signed relationship with a licensed anchor on both the EUR and TRY sides, confirmed SEP-10/12/31/38 support, and negotiated production pricing (see [`CORRIDOR_VERIFICATION.md`](./CORRIDOR_VERIFICATION.md)).
- **Mainnet cutover.** Network parameters (Horizon URL, network passphrase, anchor domain, asset issuers) are entirely environment-variable-driven — no `if (mainnet)` branching to audit — so the cutover is a configuration change against a documented procedure ([`docs/RUNBOOK.md`](./docs/RUNBOOK.md) §2.1), gated on the licensed-anchor relationship above.
- **Automated CI and monitoring.** A real Vitest suite exists and passes; wiring it into CI on every push, and connecting the structured logs and alert thresholds `lib/monitoring.ts` already emits to an external monitoring platform, remain open.

---

## 8. License & Maintainer

Maintained in the [`emir-utku-ozgen/Ferry`](https://github.com/emir-utku-ozgen/Ferry) repository. Strictly a Testnet engineering project at its current stage — no production funds, licensed anchor relationship, or Mainnet deployment exists yet; see [§7](#7-production-roadmap) for what stands between this build and a production pilot.
