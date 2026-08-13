# Ferry — Mainnet Readiness Pack

> **⚠️ TEMPLATE — operational decisions below marked `[ ]` are not yet made.**
> This document distinguishes between two kinds of content: (a) **facts derivable from the current codebase**, stated directly, and (b) **organizational/operational decisions** (key custody, incident response ownership, legal entity, insurance) that only Ferry's actual operators can make — those are left as explicit placeholders rather than invented. Presenting this document as a completed operations pack when the placeholders are unfilled would misrepresent Ferry's actual production readiness.

For the underlying technical rationale behind each item, see `GAP_ANALYSIS.md`.

---

## 1. Operations Runbook

### 1.1 What's true today (from the codebase)

- Ferry holds no funds and no private keys (`GAP_ANALYSIS.md` §3) — there is no "Ferry wallet" to operate or monitor for balance.
- All anchor-facing calls are bounded to a 10s timeout with typed failure codes (`lib/stellar/anchorFetch.ts`, `anchorError.ts`) and return `504`/`502`/passthrough-status errors rather than hanging.
- Anchor domains are allowlisted server-side (`lib/stellar/anchorAllowlist.ts`, `ANCHOR_ALLOWLIST` env var) — adding a new anchor requires an explicit config change, not a code change.
- Rate limiting is in-memory and per-process (`lib/rateLimit.ts`) — **does not** survive a restart or share state across multiple instances.

### 1.2 Decisions needed before go-live

| Item | Owner | Decision |
|---|---|---|
| On-call rotation for orchestrator downtime | `[ ]` | `[ ]` |
| Alerting thresholds (error rate, anchor timeout rate, rate-limit rejection rate) | `[ ]` | `[ ]` — no monitoring/alerting exists in the codebase yet; see `GAP_ANALYSIS.md` §5 item 5 |
| Log retention & PII handling policy for anchor error payloads (may contain partial customer data) | `[ ]` | `[ ]` |
| Deployment rollback procedure | `[ ]` | `[ ]` — current deploys are via Vercel's git integration; a documented rollback trigger/owner is not yet defined |
| Anchor allowlist change-control process (who approves adding a new `ANCHOR_ALLOWLIST` entry, and how) | `[ ]` | `[ ]` |

## 2. Refund & Incident Procedures

### 2.1 What's true today

- Ferry **cannot** process a refund itself — it holds no funds. Every refund is the responsibility of whichever anchor (sending or receiving) is holding the affected fiat or asset at the time of failure.
- Ferry's UI surfaces anchor-reported transaction status (SEP-24 polling, `components/TransferPanel.tsx`) and typed rejection reasons (`ANCHOR_REJECTED`, `ANCHOR_TIMEOUT`, etc.), but has no mechanism to trigger or track a refund once initiated at the anchor.

### 2.2 Decisions needed before go-live

| Item | Owner | Decision |
|---|---|---|
| Confirmed refund SLA per contracted anchor | `[ ]` | See `CORRIDOR_VERIFICATION.md` §3 — not yet obtained |
| User-facing support channel for a stuck/failed transaction | `[ ]` | `[ ]` |
| Incident severity classification (what counts as SEV1 vs SEV2/3) | `[ ]` | `[ ]` |
| Incident communication plan (status page, user notification method) | `[ ]` | `[ ]` |
| Post-incident review process | `[ ]` | `[ ]` |
| Escalation path to each contracted anchor's own support/incident line | `[ ]` | `[ ]` |

## 3. Key Management Plan

### 3.1 What's true today

- Ferry never holds a private key at any point — client-side signing happens entirely inside the user's Freighter extension (`GAP_ANALYSIS.md` §3). There is currently **no Ferry-controlled key of any kind** in the architecture — not a hot wallet, not a signing service, nothing.
- This means the traditional "key management plan" concerns (HSM custody, multisig thresholds, key rotation) **do not apply to Ferry's current architecture** as long as it remains a pure orchestrator.

### 3.2 Decisions needed before go-live

This section only becomes non-trivial if Ferry's scope changes to hold any key material. If it stays a pure orchestrator, the honest answer is "not applicable — document why," not an invented custody policy. If scope changes are planned, the following need real answers:

| Item | Owner | Decision |
|---|---|---|
| Will Ferry ever hold a signing key (e.g. for automation, a future custodial feature)? | `[ ]` | `[ ]` — if "no," record that decision explicitly rather than leaving it ambiguous |
| If yes: custody model (HSM, MPC, multisig threshold) | `[ ]` | `[ ]` |
| If yes: key rotation policy | `[ ]` | `[ ]` |
| If yes: who has access, and under what approval process | `[ ]` | `[ ]` |
| SEP-10 JWT signing key custody (this belongs to each **anchor**, not Ferry — confirm each contracted anchor's own key management meets your risk bar) | `[ ]` | `[ ]` |

## 4. Go-Live Checklist

### 4.1 Application-layer (trackable against this codebase)

- [ ] `NEXT_PUBLIC_NETWORK_PASSPHRASE` / `NEXT_PUBLIC_HORIZON_URL` switched to Mainnet values via reviewed config change, not a silent default (`GAP_ANALYSIS.md` §5 item 7)
- [ ] `ANCHOR_ALLOWLIST` contains only the contracted production anchor domain(s) — confirm the Testnet default (`testanchor.stellar.org`) is removed
- [ ] `lib/rateLimit.ts` migrated to a shared store if running more than one instance (`GAP_ANALYSIS.md` §5 item 3)
- [ ] Session architecture migrated to the BFF/`HttpOnly` cookie pattern described in `GAP_ANALYSIS.md` §4.4, if the XSS-exfiltration risk of the current in-memory JWT is unacceptable at Mainnet transaction values
- [ ] SEP-12 IBAN/bank-field client-side validation added, if the contracted receiving anchor doesn't perform it server-side (see `TESTNET_HASHES.md` — not present today)
- [ ] Structured logging + correlation IDs in place (`GAP_ANALYSIS.md` §5 item 5)
- [ ] Dependency supply chain reviewed (`@stellar/stellar-sdk`, `@stellar/freighter-api`) ahead of cutover
- [ ] Load test of rate-limit thresholds against the real contracted anchor's own limits (`GAP_ANALYSIS.md` §5 item 8)

### 4.2 Business/legal (not trackable from code — requires real input)

- [ ] EUR-side anchor relationship signed (`CORRIDOR_VERIFICATION.md` §1)
- [ ] TRY-side anchor relationship signed (`CORRIDOR_VERIFICATION.md` §2)
- [ ] Production parameters (limits, fees, refund SLA) confirmed in writing (`CORRIDOR_VERIFICATION.md` §3)
- [ ] Pilot terms agreed (`CORRIDOR_VERIFICATION.md` §4)
- [ ] Regulatory review completed for Ferry's own role (confirm "orchestrator, non-custodial" framing holds under the relevant jurisdiction's money-transmission definitions — this is a legal determination, not a technical one)
- [ ] Terms of service / privacy policy published, reflecting the actual data flow (Ferry proxies but does not store KYC data — `GAP_ANALYSIS.md` §3)
- [ ] Incident/refund contact information published to end users
- [ ] Third-party security audit completed (`GAP_ANALYSIS.md` §5 item 6)

---

*Every unchecked box above is a genuine open item, not a formality. This document should be re-issued once each `[ ]` is filled with a real decision, owner, and date — at that point it stops being a template.*
