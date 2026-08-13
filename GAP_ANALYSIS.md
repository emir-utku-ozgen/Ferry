# Ferry — Security & Architectural Assessment

**Document type:** Engineering security assessment
**Scope:** `Ferry` remittance orchestration application (Next.js / TypeScript / Stellar SDK)
**Network:** Stellar Testnet (pre-Mainnet)

---

## 1. Executive Summary

Ferry is a **strictly non-custodial remittance orchestrator** built on four Stellar Ecosystem Proposals — **SEP-10** (Web Authentication), **SEP-24** (Hosted Deposit/Withdrawal), **SEP-31** (Direct Cross-Border Payments), and **SEP-38** (Anchor Quotes). Its role is deliberately narrow: Ferry discovers anchor capabilities via SEP-1, negotiates authentication and pricing on the user's behalf, and hands off every value-moving and identity-verifying step to a licensed, regulated Anchor or to the user's own Freighter wallet.

At no point does Ferry:

- hold, generate, or transmit a private key or secret seed,
- custody user funds in an application-controlled account,
- collect, store, or transmit KYC/identity documents, or
- construct or submit a value-transferring Stellar transaction on the user's behalf.

This makes Ferry, architecturally, a **protocol-aware API gateway and UI layer** rather than a financial intermediary. That narrow scope is itself the primary security control: the attack surface for fund loss is delegated to Freighter (client-side signing) and the Anchor (custody, KYC, settlement) — both independently regulated components outside Ferry's trust boundary.

This document assesses Ferry's current implementation across four dimensions — **consensus/settlement correctness**, **custody and fund safety**, **application-layer security controls**, and **Mainnet production readiness** — as it stands today, not as a record of how it got here.

---

## 2. Consensus & Double-Spending Analysis

**Finding: L1 double-spending is not an applicable threat at Ferry's application layer.**

Double-spending is a settlement-layer problem, and Stellar's settlement layer is the **Stellar Consensus Protocol (SCP)** — a Federated Byzantine Agreement (FBA) system, not a Proof-of-Work chain. This distinction is structural, not incidental, to how Ferry is built:

| Property | Proof-of-Work chains | Stellar (SCP) | Implication for Ferry |
|---|---|---|---|
| Finality | Probabilistic (confirmation depth) | **Deterministic**, per ledger close | No "N confirmations" logic anywhere in Ferry |
| Reorg risk | Non-zero, grows with attacker hash power | Effectively none once a ledger closes | No reorg-handling / rollback logic required |
| Ledger close time | Minutes (BTC ~10 min) | **~5 seconds** | SEP-24 transaction status polling reflects settled state almost immediately |
| Double-spend vector | Competing chains, 51% attacks | Quorum-slice agreement prevents conflicting ledgers from validating | Out of scope for any application built on top of Horizon/SCP |

Because a Stellar ledger, once closed by quorum agreement, is final, **there is no window in which a validly signed transaction can be replayed to spend the same funds twice** at the protocol layer. This guarantee is provided by the network, not by application code — analogous to a web application not needing to reimplement TCP's retransmission and ordering guarantees.

**How Ferry's transaction surface fits this model.** Ferry constructs and asks the user to sign exactly two categories of Stellar transaction, and both are structurally incapable of double-spending because neither transfers value:

1. **SEP-10 challenge transactions** (`lib/stellar/sep10.ts`). These are anchor-issued authentication artifacts with `sourceAccount` sequence number `0`; they are signed by the user for identity proof and are **never submitted to the network**. There is no ledger entry to replay.
2. **`ChangeTrust` operations** (`lib/stellar/trustline.ts`). As part of the pre-flight trustline check ahead of a non-native SEP-24 deposit, Ferry builds a `ChangeTrust` transaction, has the user sign it with Freighter, and submits it via `getHorizonServer().submitTransaction()`. `ChangeTrust` only establishes or removes a trustline between an account and an asset issuer — it has no counterparty and moves no value. It is the one Stellar transaction type Ferry submits directly, and it sits outside the double-spend threat model by construction rather than as an exception to it.

**Actual value movement happens entirely outside Ferry's code**, in one of two places:

- **SEP-24**: the user funds a deposit (or receives a withdrawal) through the Anchor's own hosted interactive UI; the Anchor's infrastructure constructs and submits the on-chain payment.
- **SEP-31**: the sending Anchor transmits funds directly to the receiving Anchor's Stellar account; Ferry only relays transaction metadata (`quote_id`, `amount`, `asset_code`) used to initiate that transfer.

**The residual risk analogous to "double spend" in Ferry's trust boundary is session-token replay, not ledger replay** — i.e., reuse of a captured SEP-10 JWT rather than reuse of a signed transaction. That risk is addressed under §4.4 (Session Architecture).

---

## 3. Custody & Fund Safety

**Model: zero-custody by construction.**

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

**Private keys.** Never requested, received, or persisted anywhere in Ferry. `components/WalletConnect.tsx` calls `@stellar/freighter-api`'s `requestAccess()` / `getAddress()`, both of which return only a public address. Every signature — the SEP-10 challenge, the `ChangeTrust` operation — is produced inside the Freighter browser extension's isolated context via `signTransaction()`; the raw or encrypted secret key never enters Ferry's JavaScript execution context, client or server.

**Identity documents / KYC.** Never collected, stored, or proxied by Ferry. A SEP-24 interactive session (`lib/stellar/sep24.ts`) returns an Anchor-hosted `url`, which `components/TransferPanel.tsx` opens directly in a new browser window. Any personal or financial data the user submits there goes straight to the Anchor's own servers and is never visible to, or transits through, Ferry's backend.

**Funds.** Ferry holds no Stellar account of its own in the transfer path and is not a counterparty to any payment. The SEP-31 `DIRECT_PAYMENT_SERVER` settlement account belongs to the receiving Anchor, discovered via SEP-1 TOML resolution (`lib/stellar/toml.ts`) — never to Ferry.

**Secrets at rest.** `CLAUDE.md` and `.env.local.example` explicitly prohibit hardcoded private keys or seeds. Every environment variable Ferry defines is public network configuration (Horizon URL, network passphrase, anchor domain) suitable for client-side exposure via `NEXT_PUBLIC_*` — there is no server-side secret store because there is no server-side secret to store.

**What zero-custody does *not* eliminate.** Ferry is still a **trusted intermediary for session integrity and service availability**. A compromised or degraded Ferry instance cannot steal funds directly, but it could still cause real user harm — session hijacking, denial of service against legitimate users, or relaying a request to an attacker-controlled "anchor" domain. Section 4 evaluates the controls Ferry has in place against exactly those residual risks.

---

## 4. Application-Level Security Controls (Current Architecture)

### 4.1 Request Timeouts & Error Taxonomy

Every anchor-facing network call in Ferry — across `lib/stellar/sep10.ts`, `sep24.ts`, `sep31.ts`, `sep38.ts`, and `toml.ts` — is routed through a shared `anchorFetch()` wrapper (`lib/stellar/anchorFetch.ts`) rather than calling the global `fetch()` directly.

- **Bounded execution.** `anchorFetch()` attaches `AbortSignal.timeout(ANCHOR_TIMEOUT_MS)` (10 seconds, `lib/stellar/anchorError.ts`) to every request. A slow or hanging anchor endpoint can no longer hold an `/api/*` route handler open indefinitely; the request is aborted deterministically at the timeout boundary. The SEP-1 TOML resolver (`StellarToml.Resolver.resolve`, called from `toml.ts`) receives the same bound via its own `timeout` option, since it doesn't go through `fetch()`.
- **Typed failure taxonomy.** Every failure is normalized into an `AnchorError` carrying one of four codes — `ANCHOR_TIMEOUT`, `ANCHOR_UNAVAILABLE` (5xx from the anchor), `ANCHOR_REJECTED` (4xx from the anchor, status passed through), or `NETWORK_ERROR` (DNS/connection failure). `toAnchorError()` performs this classification for both raw `fetch()` rejections and the TOML resolver's own error shape.
- **Status-aware API responses.** Each `/api/sep{10,24,31,38}/*` route maps the caught `AnchorError` to an HTTP status via `toApiErrorResponse()`: timeouts surface as `504`, anchor-side outages as `502`, and anchor rejections pass through their real status code (e.g., a `403` from a bad token is returned as `403`, not folded into a generic `502`). The JSON body always includes both `error` (human-readable) and `code` (machine-readable), so the UI and any future client can branch on failure type instead of parsing message strings.

The net effect: an anchor that is slow, down, or actively rejecting requests produces a bounded, typed, correctly-coded response — never an indefinite hang and never an opaque `502` that collapses distinct failure modes into one.

### 4.2 Automated Pre-flight Trustline Checks

SEP-24 deposits of a non-native Stellar asset (e.g., USDC) require the destination account to already hold a trustline to that asset; without one, the deposit would otherwise fail only *after* the user completes the anchor's hosted KYC/funding flow. Ferry closes that gap client-side, before the interactive session is ever opened.

- **Read path.** `hasTrustline()` (`lib/stellar/trustline.ts`) calls `getHorizonServer().loadAccount(publicKey)` and checks the account's balance lines for the target `asset_code`/`asset_issuer` pair. An account that doesn't exist on the network yet (never funded) is treated as simply having no trustlines, rather than raising an error.
- **UI gating.** `components/TransferPanel.tsx` runs this check automatically whenever the selected deposit asset or connected account changes. While a non-native asset lacks a trustline, the "Start Hosted Deposit" action is disabled and an inline pre-flight alert explains the requirement — the anchor's popup is never opened into a state that's already guaranteed to fail.
- **Remediation path.** `buildChangeTrustXdr()` constructs the unsigned `ChangeTrust` transaction; the user signs it via Freighter's `signTransaction()`; `submitSignedTransaction()` posts it to Horizon. On confirmation, the UI re-enables the deposit action. As established in §2, this operation moves no value and introduces no custody or double-spend exposure — it is a pure account-configuration change, signed and submitted entirely by the user's own wallet flow.

### 4.3 API Rate Limiting & DoS Protection

All eight `/api/sep{10,24,31,38}/*` orchestrator routes are rate limited per client IP via `lib/rateLimit.ts`, an in-memory, fixed-window counter keyed by `(route name, IP)`.

- **Defaults.** Ten requests per 60-second window per IP, per route, is the default (`checkRateLimit()`). Exceeding it returns a clean `429` (`rateLimitResponse()`) with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers, plus a `{ error, code: "RATE_LIMITED" }` JSON body.
- **Polling-aware exception.** `/api/sep24/transaction` is limited at 30 requests/minute rather than the default 10. `components/TransferPanel.tsx` polls this endpoint every 4 seconds while a deposit or withdrawal is in flight — roughly 15 requests/minute of expected, legitimate traffic from Ferry's own UI. The higher ceiling leaves headroom above that real usage while still bounding an actor polling arbitrarily fast.
- **Per-route isolation.** Buckets are keyed independently per route, so exhausting the limit on one endpoint (e.g., repeated SEP-38 price lookups) does not affect a user's ability to call a different endpoint (e.g., SEP-10 authentication) in the same window.
- **Known scope boundary.** This is a **single-process, in-memory** limiter: correct and effective for a single running instance, but it does not share state across multiple horizontally-scaled instances. A multi-instance production deployment requires a shared backing store (Upstash Redis, Vercel Edge Config, or equivalent) — tracked in the roadmap below, not implemented here.

### 4.4 Session Architecture

The SEP-10 JWT — the only artifact standing in for an authenticated session — is held **exclusively in-memory**, as React `useState` in `app/page.tsx` (`sep10Token`). It is never written to `localStorage`, `sessionStorage`, or a cookie, and is lost on every page refresh, requiring re-authentication.

This has a real, deliberate benefit: nothing persists the token across browser sessions or tabs, and there is no server-side session store to compromise (consistent with §3's zero-custody, no-secret-store posture). It also has a real limitation: for as long as the token lives in page memory, it is reachable by any script executing in that page's JavaScript context. An XSS vulnerability anywhere in the render tree — including in a compromised third-party dependency — could exfiltrate a live JWT and impersonate the user's session against the Anchor for the remainder of that token's anchor-defined validity window.

**Recommendation for Mainnet.** Move to a **BFF (Backend-for-Frontend) session pattern**: after SEP-10 token exchange, have the Next.js server set an `HttpOnly`, `Secure`, `SameSite=Strict` cookie containing either the JWT itself or an opaque session identifier resolved server-side against a session store (Redis/Upstash). Subsequent calls to `/api/sep24`, `/api/sep31`, and `/api/sep38` would read the token server-side from that cookie rather than accepting it as a client-supplied parameter, as they do today. This closes the XSS-exfiltration path at the cost of introducing server-side session state — a tradeoff worth making once Ferry is handling Mainnet value, but not before.

---

## 5. Production Readiness Roadmap

Ferry's current architecture — zero custody, bounded and typed anchor communication, pre-flight trustline verification, and per-route rate limiting — is a sound foundation for a Testnet deployment. The following steps remain before Mainnet go-live, ordered by dependency:

1. **SEP-12 (KYC Customer Info API) integration.** SEP-31 direct payments against real receiving anchors require registered customer records. Ferry currently surfaces the anchor's SEP-12-gated rejection transparently but does not implement the registration flow itself — this is the largest remaining protocol gap for a functioning direct-payment path.
2. **Anchor allowlisting.** Replace free-text/default anchor domain configuration with a vetted, operator-curated allowlist (or integration with the [Stellar Anchor Directory](https://resources.stellar.org/anchors)). Today, any client-supplied `domain` is resolved and called; an allowlist closes the residual open-relay/SSRF surface of Ferry's orchestration routes.
3. **Distributed rate limiting.** Migrate `lib/rateLimit.ts` from its current in-memory, single-instance implementation to a shared store (Upstash Redis / Vercel Edge Config) before running more than one Ferry instance concurrently — the in-memory limiter's guarantees don't extend across processes.
4. **Server-side session architecture.** Implement the BFF/cookie session model described in §4.4, including JWT refresh handling ahead of anchor-defined expiry.
5. **Observability & audit logging.** Structured logging of every orchestration call (challenge issuance, quote lock, transfer initiation, rate-limit rejections) with correlation IDs, excluding any PII that may appear in anchor error payloads — required for both incident response and anchor-partner support escalations.
6. **Security review & third-party audit.** A focused review of the SEP-10 challenge validation path (client + anchor trust boundary), the anchor-domain trust model, and the dependency supply chain (`@stellar/stellar-sdk`, `@stellar/freighter-api`) ahead of the Mainnet passphrase cutover.
7. **Network cutover.** Swap `NEXT_PUBLIC_NETWORK_PASSPHRASE` / `NEXT_PUBLIC_HORIZON_URL` to Mainnet values behind an explicitly reviewed configuration change — not a silent environment default — with a rollback plan and a full Testnet-parity regression pass immediately beforehand.
8. **Load testing.** Validate the rate-limit thresholds in §4.3 against realistic anchor-side limits before go-live, so Ferry itself doesn't become the bottleneck or trigger anchor-side bans under real traffic.

---

*This document reflects the current state of the `Ferry` codebase and should be revisited whenever a new SEP is integrated or the custody/session architecture changes.*
