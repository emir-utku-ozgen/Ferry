# Ferry — Security, Architectural & Protocol Gap Analysis

**Document type:** Internal engineering assessment
**Scope:** `Ferry` remittance orchestration application (Next.js / TypeScript / Stellar SDK)
**Network:** Stellar Testnet (pre-Mainnet)

---

## 1. Executive Summary

Ferry is a **strictly non-custodial remittance orchestrator** built on top of four Stellar Ecosystem Proposals — **SEP-10** (Web Authentication), **SEP-24** (Hosted Deposit/Withdrawal), **SEP-31** (Direct Cross-Border Payments), and **SEP-38** (Anchor Quotes). Its role is deliberately narrow: Ferry discovers anchor capabilities (SEP-1), negotiates authentication and pricing on the user's behalf, and hands off every value-moving and identity-verifying step to a licensed, regulated Anchor or to the user's own Freighter wallet.

At no point in the current architecture does Ferry:

- hold, generate, or transmit a private key or secret seed,
- custody user funds in an application-controlled account,
- collect, store, or transmit KYC/identity documents, or
- independently construct and submit a value-transferring Stellar transaction.

This positions Ferry closer to a **protocol-aware API gateway and UI layer** than to a financial intermediary. That narrow scope is itself the primary security control: the attack surface for fund loss is largely delegated to Freighter (client-side signing) and the Anchor (custody, KYC, settlement), both of which are independently regulated/audited components outside Ferry's trust boundary.

This document assesses Ferry against three lenses — **consensus/settlement correctness**, **custody and fund safety**, and **application-layer security hygiene** — and enumerates the concrete gaps that must be closed before a Mainnet production launch. Findings are graded by current implementation state, not by aspiration; several gaps below represent explicit, accepted technical debt for the current Testnet-only phase.

---

## 2. Consensus & Double-Spending Analysis

**Finding: L1 double-spending is not an applicable threat at the application layer.**

Double-spending is a settlement-layer problem, and Stellar's settlement layer is the **Stellar Consensus Protocol (SCP)**, a Federated Byzantine Agreement (FBA) system — not a Proof-of-Work chain. This distinction matters directly for how Ferry is architected:

| Property | Proof-of-Work chains | Stellar (SCP) | Implication for Ferry |
|---|---|---|---|
| Finality | Probabilistic (confirmation depth) | **Deterministic**, per ledger close | No "N confirmations" logic needed anywhere in Ferry |
| Reorg risk | Non-zero, grows with attacker hash power | Effectively none once a ledger closes | No reorg-handling / rollback logic required |
| Ledger close time | Minutes (BTC ~10 min) | **~5 seconds** | Anchor-reported transaction status (SEP-24 polling) reflects settled state almost immediately |
| Double-spend vector | Competing chains, 51% attacks | Quorum-slice agreement prevents conflicting ledgers from being validated | Out of scope for any application built on top of Horizon/SCP |

Because a Stellar ledger, once closed by quorum agreement, is final, **there is no window in which the same signed transaction can be validly replayed to spend the same funds twice** at the protocol layer. This is a guarantee provided by the network itself, not by application code — identical to how a web application does not need to re-implement TCP's retransmission logic.

**Ferry's specific position relative to this guarantee:**

- Ferry **never constructs or submits a value-transferring Stellar transaction**. `lib/stellar/config.ts` exposes a `getHorizonServer()` helper for future read-only queries, but no code path in the current application calls `submitTransaction()`.
- The only transaction Ferry ever asks the user to sign is the **SEP-10 challenge transaction**, which is a non-value-transferring, anchor-issued authentication artifact (`sourceAccount` sequence number `0`, never submitted to the network). It cannot move funds and therefore cannot be double-spent in any meaningful sense.
- Actual value movement happens in one of two places, both outside Ferry's code:
  1. **SEP-24**: the user funds the deposit (or receives the withdrawal) through the Anchor's own hosted interactive flow and the Anchor's infrastructure submits/receives the on-chain payment.
  2. **SEP-31**: the sending Anchor transmits funds to the receiving Anchor's Stellar account directly; Ferry only relays the transaction metadata (`quote_id`, `amount`, `asset_code`) used to initiate that transfer.

**Residual consideration — not double-spending, but replay/reuse of the SEP-10 JWT:** the actual risk analogous to "double spend" in Ferry's trust boundary is **session-token replay**, not ledger replay. That is addressed under §4.1 below.

---

## 3. Custody & Fund Safety

**Model: Zero-custody by construction.**

Ferry implements a strict separation of concerns such that at no point does the application hold a position of trust over user funds or identity data:

```
┌──────────────┐        SEP-10 (sign only)        ┌──────────────┐
│  User Wallet │ ───────────────────────────────▶ │    Ferry      │
│ (Freighter)  │ ◀─────────────────────────────── │ (orchestrator)│
└──────────────┘        JWT / quote / URLs         └──────┬───────┘
       │                                                    │
       │  SEP-24 hosted UI popup / SEP-31 settlement         │ SEP-1/10/24/31/38
       │  (funds, KYC — direct handoff)                      │ metadata only
       ▼                                                    ▼
┌────────────────────────────────────────────────────────────────┐
│                      Licensed Anchor                            │
│   (custody, KYC/AML, fiat rails, Stellar settlement account)    │
└────────────────────────────────────────────────────────────────┘
```

**Concretely, in the current codebase:**

- **Private keys**: never requested, received, or persisted. `components/WalletConnect.tsx` calls `@stellar/freighter-api`'s `requestAccess()` / `getAddress()`, which return only a public address. All signing (`signTransaction`) happens inside the Freighter browser extension's isolated context.
- **Identity documents / KYC**: never collected by Ferry. SEP-24 interactive sessions (`lib/stellar/sep24.ts`) return an Anchor-hosted `url` that is opened directly in a new window (`components/TransferPanel.tsx`); any personal data the user submits there goes straight to the Anchor and is never proxied through, or visible to, Ferry's servers.
- **Funds**: Ferry holds no Stellar account of its own in the transfer path and is not a counterparty to any payment. The `DIRECT_PAYMENT_SERVER` (SEP-31) settlement account belongs to the receiving Anchor, discovered via SEP-1 (`lib/stellar/toml.ts`), not to Ferry.
- **Secrets at rest**: `CLAUDE.md` and `.env.local.example` explicitly prohibit hardcoded private keys/seeds; all configuration is public network parameters (Horizon URL, network passphrase, anchor domain) suitable for client-side exposure via `NEXT_PUBLIC_*`.

**What this model does *not* eliminate** — and what the remainder of this document focuses on — is Ferry's responsibility as a **trusted intermediary for session integrity and availability**. Even without custody, a compromised or degraded Ferry instance could still cause user harm (e.g., session hijacking, denial of service, or silently forwarding a request to a malicious "anchor" domain). Those are the real residual risks addressed below.

---

## 4. Application-Level Gap Analysis

The table below reflects the **actual current implementation** (verified against the codebase, not assumed), the gap relative to production-grade practice, and the recommended mitigation.

| # | Area | Current State | Identified Gap | Risk / Impact | Mitigation Strategy |
|---|---|---|---|---|---|
| 4.1 | **Session Token Storage** | The SEP-10 JWT is held **only in in-memory React state** (`app/page.tsx` → `useState<string \| null>`), never written to `localStorage`, `sessionStorage`, or a cookie. It is lost on refresh and passed explicitly as a function argument to every orchestrator call. | No persistence is actually a *partial* mitigation already, but the token is still: (a) visible to any script executing in the page (XSS-reachable, since it transits JS memory and component props), and (b) re-requested from the anchor on every page load with no refresh/revocation path. There is currently no `HttpOnly` cookie option because Ferry's API routes are stateless proxies with no server-side session store. | An XSS vulnerability anywhere in the render tree (including a compromised dependency) could exfiltrate a live JWT and impersonate the user's authenticated session against the Anchor for the JWT's validity window (anchor-defined, typically ~24h). | Introduce a **BFF (Backend-for-Frontend) session pattern**: after SEP-10 token exchange, have the Next.js server set an **`HttpOnly`, `Secure`, `SameSite=Strict` cookie** containing either the JWT itself or an opaque session ID mapped to it server-side (e.g., in Redis/Upstash). All subsequent `/api/sep24`, `/api/sep31`, `/api/sep38` calls would read the token server-side from the cookie rather than accepting it as a client-supplied body parameter as they do today. This closes the XSS-exfiltration path entirely, at the cost of adding server-side session state. |
| 4.2 | **API Rate Limiting & DoS Prevention** | **No rate limiting exists.** There is no `middleware.ts`, no dependency on a rate-limiting library (`upstash/ratelimit`, `express-rate-limit`, etc.), and no per-IP or per-account throttling on any of the eight `/api/sep{10,24,31,38}/*` routes. | Every orchestrator route performs at least one outbound network call (SEP-1 TOML resolution, anchor API call) per inbound request, with **no caching beyond the in-process TOML `Map` cache** (`lib/stellar/toml.ts`) and **no request deduplication or budget**. A single client can trigger unbounded fan-out traffic to third-party anchor infrastructure. | (a) **Self-DoS**: a scripted or buggy client can exhaust Ferry's outbound connection pool or hit anchor-side rate limits, degrading service for all users. (b) **Anchor-facing abuse**: Ferry could be used as an open relay to hammer an arbitrary anchor domain (SSRF-adjacent — see 4.2a). (c) **Cost/availability**: no protection against credential-stuffing style repeated SEP-10 challenge requests. | Add edge-level rate limiting via Next.js `middleware.ts` backed by a shared store (Vercel Edge Config / Upstash Redis) with per-IP and, post-authentication, per-account (public key) limits — e.g., 5 challenge requests/min, 20 quote requests/min. Additionally, **allowlist the anchor `domain` parameter** against a configured set of known anchors (or at minimum validate it resolves to a well-formed `stellar.toml`) rather than accepting any client-supplied domain string, to close the open-relay/SSRF vector at its root. |
| 4.3 | **Automated Trustline Verification** | **Not implemented.** `components/TransferPanel.tsx` lets a user request a SEP-24 deposit of a non-native asset (e.g., USDC) into their connected account without checking, before opening the interactive session, whether that account has an established trustline to the asset being deposited. | If the destination account lacks the required trustline, the anchor-side deposit will fail after the user has already completed KYC/funding steps in the hosted UI — a poor and confusing UX failure discovered too late in the flow, and in the worst case funds can become stuck pending manual anchor intervention or a refund cycle. | Before invoking `startSep24Deposit`, query the account's balances via Horizon (`getHorizonServer().loadAccount(publicKey)`, already scaffolded in `lib/stellar/config.ts` but unused) and verify a trustline exists for the target asset/issuer. If absent, prompt the user to submit a `ChangeTrust` operation (signed via Freighter) **before** starting the interactive deposit session, or surface a clear pre-flight warning. This is pure client-side + Horizon read logic and does not compromise the non-custodial model. |
| 4.4 | **Anchor Timeout & Error Handling** | Every anchor-facing `fetch()` call in `lib/stellar/{sep10,sep24,sep31,sep38,toml}.ts` has **no explicit timeout** (no `AbortController`/`AbortSignal.timeout()`), and error handling is limited to checking `res.ok` and surfacing the anchor's raw error body via a generic `502`. | (a) A slow or hanging anchor endpoint will hold the Next.js API route (and the underlying serverless/edge function invocation) open indefinitely, consuming compute time and degrading Ferry's own availability. (b) There is no retry/backoff for transient failures, and no distinction between "anchor is down," "anchor rejected the request," and "network partition" in the error surfaced to the UI — all collapse to a single error string rendered in components like `RemittanceFlow.tsx` and `TransferPanel.tsx`. | Wrap all anchor-facing `fetch()` calls with a bounded `AbortSignal.timeout(10_000)` (or route-appropriate value), map failures into a small typed error taxonomy (`ANCHOR_TIMEOUT`, `ANCHOR_UNAVAILABLE`, `ANCHOR_REJECTED`, `NETWORK_ERROR`), and apply limited retry-with-backoff for idempotent `GET` calls (SEP-1 TOML resolution, SEP-38 indicative pricing, SEP-24 transaction status polling). Non-idempotent calls (SEP-10 token exchange, SEP-31 transaction creation) should **not** be auto-retried without idempotency keys, to avoid duplicate transaction creation at the anchor. |

---

## 5. Production Readiness Roadmap

Ferry's current implementation is appropriate for a **Testnet demonstration / early-stage prototype**. The following is the recommended sequencing to reach Mainnet production readiness, ordered by dependency rather than arbitrary priority:

1. **Close the Application-Level Gaps (§4)** — items 4.1–4.4 above are the direct prerequisites for handling real user sessions and real anchor traffic safely, and should land before any Mainnet anchor integration is attempted.
2. **Introduce SEP-12 (KYC Customer Info API) support** — SEP-31 flows against real receiving anchors require registered customer records; Ferry currently surfaces the anchor's SEP-12-gated rejection transparently but does not implement the registration flow itself. This is the largest remaining protocol gap for a functioning direct-payment (SEP-31) path.
3. **Anchor allowlisting & directory integration** — replace free-text/default anchor domain configuration with a vetted, operator-curated allowlist (or integration with the [Stellar Anchor Directory](https://resources.stellar.org/anchors)), consistent with the SSRF mitigation in §4.2.
4. **Server-side session architecture** — implement the BFF/cookie session model from §4.1, including JWT refresh handling ahead of anchor-defined expiry.
5. **Observability & audit logging** — structured logging of every orchestration call (challenge issuance, quote lock, transfer initiation) with correlation IDs, excluding any PII that may appear in anchor error payloads. Required both for incident response and for anchor-partner support escalations.
6. **Security review & third-party audit** — a focused review of the SEP-10 challenge validation path (client + anchor trust boundary), the anchor-domain trust model, and dependency supply chain (`@stellar/stellar-sdk`, `@stellar/freighter-api`) prior to Mainnet passphrase cutover.
7. **Network cutover** — swap `NEXT_PUBLIC_NETWORK_PASSPHRASE` / `NEXT_PUBLIC_HORIZON_URL` to Mainnet values behind a feature-flagged, explicitly reviewed configuration change (not a silent env default), with a rollback plan and a Testnet-parity regression pass immediately beforehand.
8. **Load testing against rate limits (§4.2)** — validate the chosen throttling thresholds against realistic anchor-side rate limits before go-live, to avoid Ferry itself becoming the bottleneck or triggering anchor-side bans.

---

*This document reflects the state of the `Ferry` codebase at the time of writing and should be revisited whenever a new SEP is integrated or the custody/session architecture changes.*
