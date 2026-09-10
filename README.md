# Ferry

**Cross-Border Remittance & Settlement Engine on Stellar Rails**

Ferry is a non-custodial orchestration layer that routes value between EURC (Euro-denominated Stellar stablecoin) and Turkish Lira (TRY) using the Stellar Ecosystem Protocol (SEP) suite — replacing correspondent-banking (SWIFT) settlement times and layered intermediary fees with a ledger-settled transfer that completes in seconds. Ferry never takes custody of funds or identity documents: every KYC record and every unit of value stays with the licensed anchor at either end of the corridor. Ferry's role is strictly the handshake — authentication, quoting, compliance handoff, and payment instruction — never the vault.

**Live Testnet deployment:** [ferry-kappa-ten.vercel.app](https://ferry-kappa-ten.vercel.app)
**Network:** Stellar Testnet (strict — see [Production Roadmap](#9-production-roadmap) for the Mainnet cutover plan)

---

## Table of Contents

1. [Corridor Context & Macro Rationale](#1-corridor-context--macro-rationale)
2. [Architecture Overview](#2-architecture-overview)
3. [Stellar Protocol Layer (SEP Architecture)](#3-stellar-protocol-layer-sep-architecture)
4. [Infrastructure & Engineering Problems Solved](#4-infrastructure--engineering-problems-solved)
5. [Idempotent Transfer State Machine & Failure Matrix](#5-idempotent-transfer-state-machine--failure-matrix)
6. [Verified Live Testnet Evidence](#6-verified-live-testnet-evidence)
7. [Setup, Environment & Deployment](#7-setup-environment--deployment)
8. [Repository Layout](#8-repository-layout)
9. [Production Roadmap](#9-production-roadmap)
10. [License & Maintainer](#10-license--maintainer)

---

## 1. Corridor Context & Macro Rationale

**Why EUR→TRY, and why it needs fixing.** The figures below are each individually sourced and dated rather than presented as a single bundled claim — where a number is *derived* by combining two official sources (marked explicitly), the derivation is shown rather than stated as if it were itself a published statistic.

| Data point | Value | Source |
|---|---|---|
| UN SDG Target 10.c | Reduce the average transaction cost of migrant remittances to **below 3%** by 2030, and eliminate corridors above 5%, by 2030 | UN Sustainable Development Goals, Target 10.c ([sdgs.un.org/goals/goal10](https://sdgs.un.org/goals/goal10); indicator metadata: [unstats.un.org](https://unstats.un.org/sdgs/metadata/files/Metadata-10-0C-01.pdf)) |
| Global average remittance cost (sending $200) | **6.36%** as of Q3 2025 (down from 7.42% in 2016) — more than double the SDG target | World Bank, *Remittance Prices Worldwide* database |
| Cost by channel type | Digital remittances average **4.59%**; non-digital (cash-based) average **7.3%**; digital-only operators average **3.54%** | World Bank, *Remittance Prices Worldwide*, Q3 2025 |
| Germany's total outbound personal remittances | **≈ US$24 billion** (2024) | World Bank World Development Indicators, series `BM.TRF.PWKR.CD.DT` ("Personal remittances, paid") — [data.worldbank.org](https://data.worldbank.org/indicator/BM.TRF.PWKR.CD.DT?locations=DE) |
| Turkey's share of Germany's outbound remittance volume | **13%–16%** of all remittances sent from Germany (Turkey and Serbia combined account for 36%) | Deutsche Bundesbank, *"The German remittance market – an overview,"* A. Friedrich & J. Walter — [bundesbank.de](https://www.bundesbank.de/en/homepage/the-german-remittance-market-an-overview-615638) |
| **Derived: Germany→Turkey corridor volume, order of magnitude** | **≈ US$3.1–3.8 billion/yr** (≈ €2.9–3.6 billion/yr at ~0.92 EUR/USD) | **Derived, not a single published figure:** 13%–16% × Germany's ≈$24B total outbound remittances (both rows above). Shown as a range because the two source figures are from different publication years and neither is a live, corridor-specific series — treat as an order-of-magnitude indicator of corridor scale, not an audited annual total. |

**What this means for Ferry's design:** even a corridor moving billions of euros a year still runs, today, over rails that clear at a global average cost of 6.36% — more than double the UN's own 2030 target — through mechanisms (correspondent-bank SWIFT routing, undisclosed FX spreads, 1–5 business day settlement) that are structurally opaque about the exact number the recipient will receive until after the sender has already committed funds. Ferry's SEP-38 firm-quote model addresses the opacity problem directly — the net payout is shown and locked *before* the sender confirms (§3, §6) — and the Stellar settlement leg addresses the speed problem (~5-second ledger close, §4). Neither of these is a marketing claim; both are architectural properties demonstrated end-to-end in §6 below. What Ferry's current Testnet build **cannot** yet claim is a production-anchor-confirmed cost percentage for this specific corridor — that requires the anchor relationship tracked in [`CORRIDOR_VERIFICATION.md`](./CORRIDOR_VERIFICATION.md), which remains open.

---

## 2. Architecture Overview

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

The anchor at the far end of that chain is discovered dynamically per deployment — Ferry resolves whichever domain `ANCHOR_DOMAIN` points at via SEP-1 (`stellar.toml`) and never hardcodes anchor-specific logic. See [§4](#4-infrastructure--engineering-problems-solved) for why this deployment resolves to Ferry's own embedded anchor rather than a third party.

**Why non-custodial, architecturally:** every alternative to this design — holding a sender's EURC balance pending payout, or storing a recipient's KYC documents for reuse — would make Ferry itself a money-transmission and data-controller entity, with the licensing, bonding, and breach-liability exposure that implies. By construction, Ferry never has an account, database column, or code path capable of holding either (`docs/KEY_MANAGEMENT.md` §1 verifies this by grep against the entire codebase, not by policy alone). The zero-knowledge-identity property specifically means Ferry's server sees KYC field values in transit (proxying a `PUT` to the anchor's `KYC_SERVER`) but never writes them to any store it controls — there is no database to write them to.

---

## 3. Stellar Protocol Layer (SEP Architecture)

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

## 4. Infrastructure & Engineering Problems Solved

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

## 5. Idempotent Transfer State Machine & Failure Matrix

### 5.1 State machine

A transfer's lifecycle is centralized in a single reducer — `lib/transferMachine.ts` — wired into `app/page.tsx`, replacing what was previously five independent, imperatively-updated `useState` calls with an explicit action-driven state graph. Ferry does not carry a single top-level `status` enum; instead the reducer holds five fields (`sep10Token`, `lockedQuote`, `kycStatus`, `transferStatus`, `flowError`) and enforces guards that make re-applying an action, or applying a stale/out-of-order one, a safe no-op rather than a regression. The table below maps that real implementation onto a conceptual lifecycle, for readers who want the SOW-style state names:

| Conceptual stage | Represented by (real fields, `lib/transferMachine.ts`) | Triggering action |
|---|---|---|
| `INITIATED` | `sep10Token === null` (the reducer's `initialTransferState`) | — |
| `AUTHENTICATED` | `sep10Token !== null` | `AUTHENTICATED` |
| `QUOTE_LOCKED` | `lockedQuote !== null` — a SEP-38 firm quote with a `buy_amount` and `expires_at` | `QUOTE_LOCKED` |
| `KYC_PENDING` / `KYC_ACCEPTED` / `KYC_REJECTED` | `kycStatus` ∈ `not_started \| pending \| ACCEPTED \| REJECTED`, sourced from the anchor's own SEP-12 customer status | `KYC_STATUS_CHANGED` |
| `PAYMENT_PENDING` / `EXECUTING` | `transferStatus` holds the anchor's own SEP-31/24 status string while it has not yet reached a terminal value | `TRANSFER_STATUS_CHANGED` |
| `SETTLED` | `transferStatus === "completed"` (`SETTLED_STATUSES`) — a **terminal, guarded** state: once reached, further `TRANSFER_STATUS_CHANGED` or `FLOW_ERROR_RAISED` actions are no-ops, so a late/out-of-order poll response can never regress a completed transfer | `TRANSFER_STATUS_CHANGED` |
| `FAILED` | `flowError !== null`, typed by `FlowErrorType` (`components/StatusTracker.tsx`) | `FLOW_ERROR_RAISED` |
| `REFUNDED` | **Not a distinct machine state, by design.** Ferry is non-custodial — it never holds funds, so 3 of the 4 SOW failure modes never move funds in the first place ("clean," not "refunded"); the 4th (a SEP-24 hosted deposit) surfaces the **anchor's own** reported `refunded`/`refunds` fields rather than tracking refund state itself. See §5.2 and `docs/REFUND_AND_INCIDENT_PROCEDURES.md`. | — |

Idempotency here means specifically: applying the same action twice, or an action that no longer makes sense given the current state, never crashes and never silently moves a more-final state back to a less-final one. `lib/transferMachine.test.ts` covers these guards directly.

### 5.2 Failure matrix (the SOW's 4 named scenarios)

Every path below ends in a designed error screen (`components/StatusTracker.tsx`'s `ERROR_COPY`) with an explicit "why nothing needs to be refunded" explanation, not a generic error message. Full reasoning and incident-response detail: [`docs/REFUND_AND_INCIDENT_PROCEDURES.md`](./docs/REFUND_AND_INCIDENT_PROCEDURES.md) §2–§3.

| # | Failure mode | Real, reproducible trigger | Refund outcome |
|---|---|---|---|
| 1 | **Expired quote** | `Sep31Panel.send()` blocks client-side once `expires_at` has passed, before any anchor call; **anchor-side rejection also captured live** — `TESTNET_HASHES.md` §9.4 row 4, quote `mockq_mt1mdkc0f63e`, anchor returned `400 {"error":"quote_expired",...}` | Clean — nothing was ever sent |
| 2 | **Anchor rejection** | The anchor's `POST /transactions` returns non-2xx (unsupported asset, amount out of bounds, etc.), classified by `classifyTransferError()`; live examples in `TESTNET_HASHES.md` §9.4 rows 1–3 and §7 | Clean — Ferry only shows deposit instructions *after* this call succeeds, so a rejection means no Stellar payment was ever initiated |
| 3 | **Invalid IBAN** | `lib/iban.ts` (ISO 13616 format table + mod-97-10 checksum) rejects a malformed IBAN client-side in `KycModal`/`claim/[id]`, before submission | Clean — nothing was ever sent. **Caveat, stated plainly:** no current test anchor performs its own bank-detail validation strictly enough to reproduce an *anchor-side* IBAN rejection (`TESTNET_HASHES.md`, "Failure scenarios requested but not genuinely reproducible" table) — Ferry's own client-side guard is real and tested, but that specific anchor-side row remains open pending a production anchor with real validation |
| 4 | **Failed KYC** | Sending is gated on `kycStatus === "ACCEPTED"` — a `REJECTED` SEP-12 status blocks before a transaction can be created | Clean — nothing was ever sent. **Same caveat as above:** both `testanchor.stellar.org` and Ferry's own mock anchor auto-accept SEP-12 submissions regardless of data quality, so a genuine anchor-side KYC rejection has not yet been captured live; the client-side gate itself is real and enforced |

---

## 6. Verified Live Testnet Evidence

### 6.1 Successful end-to-end settlement

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

### 6.2 Failure-path evidence

Per the failure matrix (§5.2), a "clean" outcome for 3 of the 4 scenarios means **no Stellar transaction is ever created** — the absence of a settlement hash is the expected, correct evidence, not a gap. What's independently checkable for each:

| Scenario | Evidence | Status |
|---|---|---|
| Expired quote | Real anchor-side `400 quote_expired` response, `TESTNET_HASHES.md` §9.4 row 4 | ✅ Reproduced against Ferry's own mock anchor |
| Anchor rejection | Real anchor-side `400` responses (unsupported asset, amount bounds), `TESTNET_HASHES.md` §9.4 rows 1–3, §7 | ✅ Reproduced against both the public reference anchor and Ferry's mock anchor |
| Invalid IBAN | `lib/iban.ts` unit-level validation; blocks submission before any network call | ✅ Client-side guard implemented and tested; ⚠️ anchor-side rejection not yet reproducible against any available test anchor (§5.2) |
| Failed KYC | `kycStatus === "REJECTED"` gate in `Sep31Panel` | ✅ Client-side gate implemented; ⚠️ anchor-side rejection not yet reproducible against any available test anchor (§5.2) |

---

## 7. Setup, Environment & Deployment

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

### Testing & Simulation

```bash
npm run test               # Vitest — lib/stellar/*, lib/mockAnchor/*, lib/idempotency.ts,
                            # lib/rateLimit.ts, lib/monitoring.ts, lib/transferMachine.ts,
                            # lib/iban.ts, and component-level logic (83 tests, 11 files)
cd mock-anchor && npm test  # node --test — mock-anchor/settlement.test.js (settlement/underpayment logic)
```

There is no separate "testnet simulation script" beyond the test suites above and the manually-run, independently-verifiable flows recorded in [`TESTNET_HASHES.md`](./TESTNET_HASHES.md) — that document *is* the simulation record: real requests against real Testnet infrastructure, with every response and resulting transaction hash captured as it happened, not a scripted mock. To reproduce a run yourself: start the app (`npm run dev`), optionally start `mock-anchor/` locally (`cd mock-anchor && npm install && npm start`) or set `NEXT_PUBLIC_ENABLE_EMBEDDED_MOCK_ANCHOR=true`, then walk the UI exactly as `docs/DEMO_SCRIPT.md` describes.

### Deployment

Ferry deploys to Vercel with zero custom build configuration — standard Next.js git integration. When `NEXT_PUBLIC_ENABLE_EMBEDDED_MOCK_ANCHOR=true` is set, the deployment automatically resolves anchor requests against its own domain (detected via the incoming request's `Host` header, with Vercel's automatic `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL` as fallbacks) and self-allowlists — no second host to operate. Pin `MOCK_ANCHOR_SIGNING_SECRET`/`MOCK_ANCHOR_TRY_ISSUER_SECRET` before treating a deployment as demo-ready: an unpinned secret is regenerated per cold-started serverless function, which is not stable across SEP-10's own challenge-issue/challenge-verify requirement.

---

## 8. Repository Layout

```
app/
  api/                 # Orchestrator routes — SEP-10/12/24/31/38, audit, health
  api/mock-anchor/      # Embedded anchor implementation (SEP-1/10/12/31/38)
  .well-known/          # stellar.toml — embedded anchor's SEP-1 discovery document
  claim/                # Recipient-facing claim link (no Stellar wallet required)
components/              # Sender-facing UI — wallet connect, quote calculator, transfer panel
lib/stellar/             # SEP client modules, allowlist, TOML resolution, error taxonomy
lib/mockAnchor/          # Embedded anchor's config, state, settlement detection
lib/transferMachine.ts   # Transfer-lifecycle reducer (§5.1)
lib/iban.ts              # ISO 13616 IBAN format + mod-97 checksum validation
lib/logger.ts            # Structured JSON logging
lib/monitoring.ts        # In-memory failure-rate alerting, feeds GET /api/health
mock-anchor/             # Standalone Express reference implementation (local/self-hosted use)
docs/                    # Runbook, refund/incident procedures, key management, go-live checklist
```

---

## 9. Production Roadmap

Ferry's architecture is deliberately stateless and non-custodial; the items below are what stand between the current Testnet build and a production pilot — tracked in detail in [`GAP_ANALYSIS.md`](./GAP_ANALYSIS.md) and [`docs/GO_LIVE_CHECKLIST.md`](./docs/GO_LIVE_CHECKLIST.md).

- **Durable state migration.** Rate limiting, idempotency caching, the audit trail, and the embedded anchor's own customer/quote/transaction records are currently in-memory and process-local — correct for a single warm serverless instance, not for horizontal scale. Migrating to a shared store (PostgreSQL for durable records, Redis for rate limiting/idempotency) is the concrete next step for each.
- **Licensed anchor integration.** The TRY leg is currently served by Ferry's own embedded mock anchor — explicitly a Testnet development harness, not a fiat-backed asset or a licensed money-transmission entity. Production requires a signed relationship with a licensed anchor on both the EUR and TRY sides, confirmed SEP-10/12/31/38 support, and negotiated production pricing (see [`CORRIDOR_VERIFICATION.md`](./CORRIDOR_VERIFICATION.md)).
- **Mainnet cutover.** Network parameters (Horizon URL, network passphrase, anchor domain, asset issuers) are entirely environment-variable-driven — no `if (mainnet)` branching to audit — so the cutover is a configuration change against a documented procedure ([`docs/RUNBOOK.md`](./docs/RUNBOOK.md) §2.1), gated on the licensed-anchor relationship above.
- **Automated CI and monitoring.** A real Vitest suite exists and passes; wiring it into CI on every push, and connecting the structured logs and alert thresholds `lib/monitoring.ts` already emits to an external monitoring platform, remain open.

---

## 10. License & Maintainer

Maintained in the [`emir-utku-ozgen/Ferry`](https://github.com/emir-utku-ozgen/Ferry) repository. Strictly a Testnet engineering project at its current stage — no production funds, licensed anchor relationship, or Mainnet deployment exists yet; see [§9](#9-production-roadmap) for what stands between this build and a production pilot.
